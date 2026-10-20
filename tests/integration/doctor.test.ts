import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterEach, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';
import { publicProcedure, router } from '../../apps/backend/src/server/trpc.js';
import { prepareLocalDatabase } from '../../scripts/db/local.mjs';
import { diagnose, probeDatabase } from '../../scripts/project/doctor.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const config = {
  ...JSON.parse(await readFile(join(repository, 'renova.project.json'), 'utf8')),
  profile: 'public',
  capabilities: [],
};
const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];
const probes = {
  nodeVersion: '24.0.0',
  run: async (command: string) => ({ stdout: command === 'pnpm' ? '10.33.4' : 'available' }),
  dependencies: async () => {},
  database: async () => true,
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'renova-doctor-integration-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify(config));
  await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.33.4' }));
  const handle = await prepareLocalDatabase(root);
  return { root, handle };
}
async function snapshot(root: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  async function visit(relative: string) {
    for (const name of (await readdir(join(root, relative))).sort()) {
      const path = join(relative, name);
      const stat = await lstat(join(root, path));
      if (stat.isDirectory()) await visit(path);
      else
        result[path] = {
          mode: stat.mode,
          mtime: stat.mtimeMs,
          hash: createHash('sha256')
            .update(await readFile(join(root, path)))
            .digest('hex'),
        };
    }
  }
  await visit('');
  return result;
}
async function listen(port: number, handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('verifica portas locais reais e preserva bytes permissoes e datas de todos os arquivos', async () => {
  const { root } = await fixture();
  const before = await snapshot(root);
  const result = await diagnose(root, probes);
  expect(result.exitCode).toBe(0);
  expect(result.checks.find((check: { id: string }) => check.id === 'services')).toMatchObject({
    status: 'ready',
    action: 'pnpm dev',
  });
  expect(await snapshot(root)).toEqual(before);
});

it('detecta servico parcial e servidor alheio sem interromper nenhum processo', async () => {
  const { root, handle } = await fixture();
  await listen(Number(handle.env.PORT), (_request, response) =>
    response.end('SECRET-foreign-body'),
  );
  const partial = await diagnose(root, probes);
  expect(partial.exitCode).toBe(1);
  expect(partial.checks.find((check: { id: string }) => check.id === 'services')?.status).toBe(
    'failed',
  );
  await listen(Number(new URL(handle.env.FRONTEND_URL).port), (_request, response) =>
    response.end('SECRET-foreign-body'),
  );
  const foreign = await diagnose(root, probes);
  expect(foreign.exitCode).toBe(1);
  expect(JSON.stringify(foreign)).not.toContain('SECRET-foreign-body');
  expect(await (await fetch(`http://127.0.0.1:${handle.env.PORT}`)).text()).toBe(
    'SECRET-foreign-body',
  );
});

it('confirma contrato HTTP de frontend API e proxy sem gravar arquivos', async () => {
  const { root, handle } = await fixture();
  const backend = await createApp(
    parseEnv({ ...process.env, FRONTEND_URL: handle.env.FRONTEND_URL, PORT: handle.env.PORT }),
    {
      // This fixture exercises health/proxy transport, without an identity database.
      router: router({
        system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
      }),
      readiness: async () => true,
      logStream: { write: () => {} },
    },
  );
  try {
    await backend.listen({ host: '127.0.0.1', port: Number(handle.env.PORT) });
    await listen(Number(new URL(handle.env.FRONTEND_URL).port), async (request, response) => {
      if (request.url === '/')
        response.end('<!doctype html><title>Produto</title><div id="root"></div>');
      else {
        const api = await fetch(`http://127.0.0.1:${handle.env.PORT}${request.url}`);
        response.writeHead(api.status, { 'x-request-id': api.headers.get('x-request-id') ?? '' });
        response.end(await api.text());
      }
    });
    const before = await snapshot(root);
    const result = await diagnose(root, probes);
    expect(result.exitCode).toBe(0);
    expect(result.checks.find((check: { id: string }) => check.id === 'services')).toMatchObject({
      status: 'ready',
      message: expect.stringContaining('proxy local'),
    });
    expect(await snapshot(root)).toEqual(before);
  } finally {
    await backend.close();
  }
});

it('nao segue redirecionamento HTTP nem exibe a localizacao recebida', async () => {
  const { root, handle } = await fixture();
  const redirect: Parameters<typeof createServer>[0] = (_request, response) => {
    response.writeHead(302, { location: 'https://SECRET-remote.example/' });
    response.end();
  };
  await listen(Number(handle.env.PORT), redirect);
  await listen(Number(new URL(handle.env.FRONTEND_URL).port), redirect);
  const result = await diagnose(root, probes);
  expect(result.exitCode).toBe(1);
  expect(JSON.stringify(result)).not.toContain('SECRET-remote');
});

it('executa CLI por alias de diretorio com uma unica resposta JSON e codigo correto', async () => {
  const { root } = await fixture();
  const alias = join(root, 'repository-alias');
  await symlink(repository, alias, 'dir');
  const result = await new Promise<{
    code: string | number | undefined;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    execFile(
      process.execPath,
      [join(alias, 'scripts/project/doctor.mjs'), '--json', '--unknown'],
      { timeout: 5000 },
      (error, stdout, stderr) => {
        resolve({ code: error?.code, stdout, stderr });
      },
    );
  });
  expect(result.code).toBe(2);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    schemaVersion: 1,
    exitCode: 2,
    status: 'invalid',
  });
});

it('consulta identidade e schema no DB descartavel sem alterar registros nem historico', async () => {
  const env = { ...process.env };
  if (!/^renova_[a-f0-9]{12}_test$/.test(env.POSTGRES_DB ?? ''))
    throw new Error('Run through pnpm test:integration');
  const handle = {
    env,
    plan: {
      target: 'test',
      databaseName: env.POSTGRES_DB,
      projectId: env.RENOVA_DB_PROJECT_ID,
      composeProject: env.RENOVA_COMPOSE_PROJECT,
      port: Number(env.POSTGRES_HOST_PORT),
    },
  };
  const db = new pg.Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const inspect = async () => ({
    rows: (await db.query('select * from public.public_example_records order by id')).rows,
    history: (await db.query('select * from renova_meta.migrations order by id')).rows,
  });
  try {
    const before = await inspect();
    expect(await probeDatabase(repository, handle)).toBe(true);
    const otherId = randomUUID();
    expect(
      await probeDatabase(repository, {
        plan: { ...handle.plan, projectId: otherId },
        env: { ...env, RENOVA_DB_PROJECT_ID: otherId },
      }),
    ).toBe(false);
    await expect(
      probeDatabase(repository, {
        ...handle,
        env: { ...env, DATABASE_URL: env.DATABASE_URL?.replace('127.0.0.1', 'remote.example') },
      }),
    ).rejects.toThrow();
    expect(await inspect()).toEqual(before);
  } finally {
    await db.end();
  }
});
