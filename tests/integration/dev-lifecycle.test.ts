import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

const launcher = fileURLToPath(new URL('../../scripts/project/dev.mjs', import.meta.url));
interface ProcessRecord {
  event: 'leader' | 'ready';
  name: string;
  pid: number;
  group: number;
  port?: number;
}

const fixtures: Awaited<ReturnType<typeof startFixture>>[] = [];

async function startFixture(mode: 'normal' | 'stubborn' = 'normal') {
  const directory = await mkdtemp(join(tmpdir(), 'renova-dev-lifecycle-'));
  const server = join(directory, 'server.mjs');
  const pnpm = join(directory, 'pnpm');
  await writeFile(
    server,
    `
import { createServer } from 'node:net';
const [name, group, mode] = process.argv.slice(2);
const server = createServer((socket) => socket.end());
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ event: 'ready', name, pid: process.pid, group: Number(group), port: server.address().port }) + '\\n');
});
process.on('SIGTERM', () => {
  if (mode !== 'stubborn') server.close(() => process.exit(0));
});
`,
  );
  await writeFile(
    pnpm,
    `#!${process.execPath}
import { spawn } from 'node:child_process';
const name = process.argv[3];
process.stdout.write(JSON.stringify({ event: 'leader', name, pid: process.pid, group: process.pid }) + '\\n');
spawn(process.execPath, [process.env.STUB_SERVER, name, String(process.pid), process.env.STUB_MODE], { stdio: 'inherit' });
process.on('SIGUSR2', () => process.exit(7));
if (process.env.STUB_MODE === 'stubborn') process.on('SIGTERM', () => {});
`,
    { mode: 0o755 },
  );
  const records: ProcessRecord[] = [];
  let pendingOutput = '';
  let stderr = '';
  const child = spawn(process.execPath, [launcher], {
    cwd: directory,
    detached: true,
    env: {
      PATH: directory,
      DATABASE_URL: 'synthetic-no-connection',
      STUB_MODE: mode,
      STUB_SERVER: server,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise<number | null>((accept, reject) => {
    child.once('exit', (code) => accept(code));
    child.once('error', reject);
  });
  child.stdout.on('data', (data: Buffer) => {
    pendingOutput += data.toString();
    const lines = pendingOutput.split('\n');
    pendingOutput = lines.pop() ?? '';
    for (const line of lines.filter(Boolean)) records.push(JSON.parse(line));
  });
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString();
  });
  const fixture = { child, exited, records, directory, stderr: () => stderr };
  fixtures.push(fixture);
  await vi.waitFor(
    () => {
      expect(fixture.stderr()).toBe('');
      expect(records.filter((record) => record.event === 'ready')).toHaveLength(2);
    },
    { timeout: 3000, interval: 25 },
  );
  return fixture;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portIsOpen(port: number): Promise<boolean> {
  return new Promise((accept, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      accept(true);
    });
    socket.once('error', () => {
      socket.destroy();
      accept(false);
    });
    socket.setTimeout(500, () => {
      socket.destroy();
      reject(new Error('Port probe timed out'));
    });
  });
}

async function assertStopped(fixture: Awaited<ReturnType<typeof startFixture>>, exitCode: number) {
  await expect(fixture.exited).resolves.toBe(exitCode);
  await vi.waitFor(
    async () => {
      for (const record of fixture.records) {
        expect(processExists(record.pid)).toBe(false);
        if (record.port) expect(await portIsOpen(record.port)).toBe(false);
      }
    },
    { timeout: 1500, interval: 25 },
  );
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    // Somente grupos criados e anunciados por esta fixture descartável.
    const groups = new Set(fixture.records.map((record) => record.group));
    if (fixture.child.pid) groups.add(fixture.child.pid);
    for (const group of groups) {
      try {
        process.kill(-group, 'SIGKILL');
      } catch {
        /* grupo já encerrado */
      }
    }
    await fixture.exited;
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

describe('lifecycle do launcher local', () => {
  it('orienta o setup quando o clone ainda nao tem ambiente local', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'renova-dev-first-run-'));
    try {
      await expect(
        promisify(execFile)(process.execPath, [launcher], {
          cwd: directory,
          env: {},
          timeout: 3000,
        }),
      ).rejects.toMatchObject({
        code: 1,
        stdout: '',
        stderr: 'Ambiente local ausente. Execute pnpm run setup.\n',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'encerra todos os filhos e portas em %s',
    async (signal) => {
      const fixture = await startFixture();
      fixture.child.kill(signal);
      await assertStopped(fixture, 0);
    },
  );

  it('encerra descendentes mesmo quando um wrapper falha antes deles', async () => {
    const fixture = await startFixture();
    const backend = fixture.records.find(
      (record) => record.event === 'leader' && record.name === '@renova/backend',
    );
    if (!backend) throw new Error('Missing backend wrapper');
    process.kill(backend.pid, 'SIGUSR2');
    await assertStopped(fixture, 7);
  });

  it('forca encerramento limitado aos grupos que ignoram SIGTERM', async () => {
    const fixture = await startFixture('stubborn');
    const neighbor = await startFixture();
    fixture.child.kill('SIGTERM');
    await assertStopped(fixture, 0);
    for (const record of neighbor.records) {
      expect(processExists(record.pid)).toBe(true);
      if (record.port) expect(await portIsOpen(record.port)).toBe(true);
    }
    neighbor.child.kill('SIGTERM');
    await assertStopped(neighbor, 0);
  });
});
