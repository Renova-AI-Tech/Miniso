import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../apps/backend/src/env';
import { createApp } from '../../apps/backend/src/server/app';
import { createApiClient } from '../../apps/frontend/src/api';

describe('contrato frontend/backend (REQ-001, REQ-024)', () => {
  it('consome contrato tipado sem carregar backend no browser', async () => {
    const env = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://runtime:synthetic@127.0.0.1:5432/transport_test',
    });
    const app = await createApp(env);
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const client = createApiClient(`${address}/api/trpc`);
      expect(await client.system.health.query()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });

  it('recusa chamada incompatível com contrato durante compilacao', () => {
    const dir = mkdtempSync(join(tmpdir(), 'renova-contract-'));
    try {
      writeFileSync(
        join(dir, 'negative.ts'),
        `import { createApiClient } from ${JSON.stringify(resolve('apps/frontend/src/api.ts'))};\nvoid createApiClient().system.health.query({ invalid: true });\n`,
      );
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            noEmit: true,
            strict: true,
            skipLibCheck: true,
            module: 'ESNext',
            moduleResolution: 'Bundler',
            target: 'ES2022',
            allowImportingTsExtensions: true,
          },
          files: ['negative.ts'],
        }),
      );
      const result = spawnSync('pnpm', ['exec', 'tsc', '-p', join(dir, 'tsconfig.json')], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('negative.ts');
      expect(result.stdout).toContain('not assignable');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('bundle publico nao inclui runtime backend nem segredos', () => {
    execFileSync('pnpm', ['--filter', '@renova/frontend', 'build'], { stdio: 'pipe' });
    const assets = resolve('apps/frontend/dist/assets');
    const code = readdirSync(assets)
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(join(assets, name), 'utf8'))
      .join('\n');
    expect(code).toContain('Conectando');
    for (const forbidden of [
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'pg-protocol',
      'FastifyInstance',
      'transport_test',
    ]) {
      expect(code).not.toContain(forbidden);
    }
    expect(readdirSync(assets).filter((name) => name.endsWith('.map'))).toEqual([]);
  });
});
