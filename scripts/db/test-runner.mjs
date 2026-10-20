import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { parseProjectConfig } from '../project/config.mjs';
import { createTestDatabase, startMailpit, stopTestDatabase } from './local.mjs';
import { buildMigrator, migrateLocalDatabase } from './migrate.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode = 'integration', ...filters] = process.argv.slice(2);
if (!['integration', 'e2e'].includes(mode) || filters.some((value) => value.startsWith('-'))) {
  throw new Error('Use integration ou e2e e, opcionalmente, caminhos de testes.');
}
let handle;
let child;
let requestedSignal;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    requestedSignal = signal;
    child?.kill(signal);
  });
}
try {
  const config = parseProjectConfig(
    JSON.parse(await readFile(new URL('../../renova.project.json', import.meta.url), 'utf8')),
  );
  if (config.profile === 'authenticated')
    await promisify(execFile)('pnpm', ['--filter', '@renova/auth', 'build'], {
      cwd: root,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
  await buildMigrator(root);
  handle = await createTestDatabase(root);
  if (requestedSignal) throw new Error('Validation interrupted');
  await migrateLocalDatabase(handle);
  if (handle.env.PROFILE === 'authenticated') await startMailpit(root, handle);
  // Each browser file gets a fresh server: independent journeys must not spend
  // another file's IP budget. The application's rate limits remain unchanged.
  const groups =
    mode === 'e2e' && !filters.length
      ? (await readdir(join(root, 'tests/e2e'), { recursive: true }))
          .filter((path) => /\.(spec|test)\.[jt]sx?$/.test(path))
          .sort()
          .map((path) => [join('tests/e2e', path)])
      : [filters];
  if (!groups.length) throw new Error('No browser tests found');
  for (const [index, group] of groups.entries()) {
    if (requestedSignal) throw new Error('Validation interrupted');
    const args =
      mode === 'integration'
        ? ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts', ...group]
        : ['exec', 'playwright', 'test', ...group, '--output', `test-results/suite-${index + 1}`];
    process.exitCode = await new Promise((accept, reject) => {
      child = spawn('pnpm', args, {
        cwd: root,
        env: { ...process.env, ...handle.env },
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code) => accept(code ?? 1));
    });
    if (process.exitCode !== 0) break;
  }
} catch {
  process.stderr.write(
    'Validação interrompida: não foi possível preparar ou executar o banco descartável.\n',
  );
  process.exitCode = 1;
} finally {
  if (handle) await stopTestDatabase(root, handle);
}
