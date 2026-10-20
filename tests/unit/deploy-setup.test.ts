import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Operational scripts deliberately run as native Node ESM.
import { parseSetupArgs, setupRailway } from '../../scripts/deploy/setup.mjs';

const target = {
  project: '11111111-1111-4111-8111-111111111111',
  environment: '22222222-2222-4222-8222-222222222222',
  service: '33333333-3333-4333-8333-333333333333',
  database: '44444444-4444-4444-8444-444444444444',
  origin: 'https://pilot.example.com',
};
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(profile = 'public') {
  const root = await mkdtemp(join(tmpdir(), 'renova-setup-test-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify({ profile }));
  const calls: { args: string[]; input?: string }[] = [];
  let app: Record<string, string> = {};
  const run = (args: string[], input?: string) => {
    calls.push({ args, input });
    if (args[0] === 'variable') {
      const db = args.includes(target.database);
      return JSON.stringify({
        RAILWAY_PROJECT_ID: target.project,
        RAILWAY_ENVIRONMENT_ID: target.environment,
        RAILWAY_SERVICE_ID: db ? target.database : target.service,
        ...(db
          ? {
              RAILWAY_PRIVATE_DOMAIN: 'postgres.railway.internal',
              POSTGRES_DB: 'renova_piloto',
              POSTGRES_USER: 'postgres',
            }
          : app),
      });
    }
    if (args[0] === 'api') app = JSON.parse(input ?? '{}').input.variables;
    return '{}';
  };
  return {
    root,
    calls,
    run,
    get app() {
      return app;
    },
  };
}
describe('configuração inicial Railway', () => {
  it('exige destino explícito e origem canônica antes de I/O', () => {
    expect(
      parseSetupArgs(Object.entries(target).flatMap(([key, value]) => [`--${key}`, value])),
    ).toEqual(target);
    for (const patch of [
      { project: 'invalid' },
      { database: target.service },
      { origin: 'http://pilot.example.com' },
      { origin: 'https://pilot.example.com/' },
    ]) {
      expect(() =>
        parseSetupArgs(
          Object.entries({ ...target, ...patch }).flatMap(([key, value]) => [`--${key}`, value]),
        ),
      ).toThrow();
    }
  });
  it('envia segredos somente por stdin e repete sem rotacionar credenciais', async () => {
    const f = await fixture('authenticated');
    await setupRailway(target, f.root, f.run);
    const first = { ...f.app };
    await setupRailway(target, f.root, f.run);
    expect(f.app).toEqual(first);
    expect(f.app.DATABASE_URL).toContain('renova_runtime:');
    expect(f.app.MIGRATION_DATABASE_URL).toContain('renova_migrator:');
    expect(f.app.AUTH_SECRET).toMatch(/^[a-f\d]{64}$/);
    const saved = JSON.parse(
      await readFile(join(f.root, '.renova/railway-credentials.json'), 'utf8'),
    );
    for (const call of f.calls) {
      expect(JSON.stringify(call.args)).not.toContain(saved.runtime);
      expect(JSON.stringify(call.args)).not.toContain(saved.migrator);
    }
    expect((await stat(join(f.root, '.renova/railway-credentials.json'))).mode & 0o777).toBe(0o600);
    expect(f.calls.find((call) => call.args[0] === 'ssh')?.input).toContain(
      'renova_bootstrap.identity',
    );
  });
  it('recusa identidade retornada divergente antes de escrever no banco', async () => {
    const f = await fixture();
    await expect(setupRailway(target, f.root, () => '{}')).rejects.toThrow('diverge');
    expect(f.calls).toHaveLength(0);
  });
  it('preserva aplicação já configurada sem cópia local das credenciais', async () => {
    const f = await fixture();
    await setupRailway(target, f.root, f.run);
    await rm(join(f.root, '.renova/railway-credentials.json'));
    f.calls.length = 0;
    await expect(setupRailway(target, f.root, f.run)).rejects.toThrow('já configurada');
    expect(f.calls.every((call) => call.args[0] === 'variable')).toBe(true);
  });
  it('não configura aplicação quando bootstrap falha', async () => {
    const f = await fixture();
    await expect(
      setupRailway(target, f.root, (args: string[], input?: string) => {
        if (args[0] === 'ssh') throw new Error('Bootstrap recusado');
        return f.run(args, input);
      }),
    ).rejects.toThrow('Bootstrap');
    expect(f.calls.some((call) => call.args[0] === 'api')).toBe(false);
  });
  it('recusa credenciais com permissões abertas antes de qualquer escrita remota', async () => {
    const f = await fixture();
    await setupRailway(target, f.root, f.run);
    await chmod(join(f.root, '.renova/railway-credentials.json'), 0o644);
    f.calls.length = 0;
    await expect(setupRailway(target, f.root, f.run)).rejects.toThrow('Arquivo local inválido');
    expect(f.calls.every((call) => call.args[0] === 'variable')).toBe(true);
  });
  it('recusa falha de autenticação dos papéis antes de publicar variáveis', async () => {
    const f = await fixture();
    await expect(
      setupRailway(target, f.root, (args: string[], input?: string) => {
        if (input?.includes('PGPASSWORD')) throw new Error('Credencial recusada');
        return f.run(args, input);
      }),
    ).rejects.toThrow('Credencial recusada');
    expect(f.calls.some((call) => call.args[0] === 'api')).toBe(false);
  });
});
