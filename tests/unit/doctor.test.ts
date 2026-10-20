import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { prepareLocalDatabase } from '../../scripts/db/local.mjs';
import { diagnose, doctorMain, formatDiagnosis } from '../../scripts/project/doctor.mjs';

const roots: string[] = [];
const config = {
  ...JSON.parse(await readFile(new URL('../../renova.project.json', import.meta.url), 'utf8')),
  profile: 'public',
  capabilities: [],
};
const probes = {
  nodeVersion: '24.0.0',
  run: async (command: string) => ({ stdout: command === 'pnpm' ? '10.33.4' : 'available' }),
  dependencies: async () => {},
  database: async () => true,
  port: async () => 'free',
};
async function fixture(prepared = true) {
  const root = await mkdtemp(join(tmpdir(), 'renova-doctor-unit-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify(config));
  await writeFile(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.33.4' }));
  if (prepared) await prepareLocalDatabase(root);
  return root;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('diagnostica falhas sem revelar segredos', async () => {
  const root = await fixture();
  const sentinel = 'SECRET-doctor-should-never-appear';
  const fail = async () => {
    throw new Error(`postgresql://user:${sentinel}@127.0.0.1/db`);
  };
  const result = await diagnose(root, { ...probes, run: fail, database: fail, port: fail });
  expect(result.exitCode).toBe(1);
  expect(
    result.checks
      .filter((check: { status: string }) => check.status === 'failed')
      .map((check: { id: string }) => check.id),
  ).toEqual(['pnpm', 'docker', 'compose', 'database', 'services']);
  expect(JSON.stringify(result)).not.toContain(sentinel);
  expect(formatDiagnosis(result)).not.toContain(sentinel);
  expect(JSON.stringify(result)).not.toContain('postgresql://');
  expect(result.nextActions).toContain('Abra o Docker e repita pnpm run doctor.');
});

it('considera ambiente pronto com aplicacao desligada e portas livres', async () => {
  const result = await diagnose(await fixture(), probes);
  expect(result).toMatchObject({ schemaVersion: 1, status: 'ready', exitCode: 0 });
  expect(result.nextActions).toEqual(['pnpm dev']);
  expect(result.checks.find((check: { id: string }) => check.id === 'remote')).toMatchObject({
    status: 'info',
    message: expect.stringContaining('não verificados'),
  });
});

it('mostra como preparar clone sem dependencias nem ambiente', async () => {
  const result = await diagnose(await fixture(false), {
    ...probes,
    dependencies: async () => {
      throw new Error();
    },
  });
  expect(result.exitCode).toBe(1);
  expect(result.checks.find((check: { id: string }) => check.id === 'environment')).toMatchObject({
    status: 'failed',
    action: 'pnpm run setup -- --config renova.project.json --yes',
  });
});

it('recusa perfil com login sem módulo instalado antes de executar comandos', async () => {
  const root = await fixture(false);
  await writeFile(
    join(root, 'renova.project.json'),
    JSON.stringify({ ...config, profile: 'authenticated', capabilities: ['auth'] }),
  );
  let calls = 0;
  const result = await diagnose(root, {
    ...probes,
    run: async () => {
      calls++;
      return { stdout: '' };
    },
  });
  expect(result.exitCode).toBe(2);
  expect(calls).toBe(0);
});

it('recusa ambiente remoto ou portas inconsistentes antes de acessar a rede', async () => {
  const root = await fixture();
  const path = join(root, '.env');
  await writeFile(
    path,
    (await readFile(path, 'utf8')).replace(
      'FRONTEND_URL=http://127.0.0.1:',
      'FRONTEND_URL=https://remote.example:',
    ),
  );
  let networkCalls = 0;
  const result = await diagnose(root, {
    ...probes,
    database: async () => {
      networkCalls++;
      return true;
    },
    port: async () => {
      networkCalls++;
      return 'free';
    },
  });
  expect(result.exitCode).toBe(2);
  expect(networkCalls).toBe(0);
});

it('identifica preparacao interrompida sem tentar reparar o journal', async () => {
  const root = await fixture(false);
  await mkdir(join(root, '.renova/db-setup.pending'), { recursive: true });
  const result = await diagnose(root, probes);
  expect(result.exitCode).toBe(1);
  expect(result.checks.at(-1)).toMatchObject({
    id: 'setup',
    status: 'failed',
    message: expect.stringContaining('interrompida'),
  });
});

it('distingue checkpoint incompleto de checkpoint invalido sem expor campos', async () => {
  const root = await fixture();
  const path = join(root, '.renova/setup-state.json');
  await writeFile(
    path,
    JSON.stringify({ schemaVersion: 1, status: 'failed', steps: [], secret: 'SECRET-state' }),
  );
  const failed = await diagnose(root, probes);
  expect(failed.exitCode).toBe(1);
  expect(JSON.stringify(failed)).not.toContain('SECRET-state');
  await writeFile(path, JSON.stringify({ schemaVersion: 99, status: 'ready', steps: [] }));
  expect((await diagnose(root, probes)).exitCode).toBe(2);
});

it('recusa symlink de ambiente sem ler seu conteudo', async () => {
  const root = await fixture();
  const outside = await fixture(false);
  await writeFile(join(outside, 'secret'), 'SECRET-outside');
  await rm(join(root, '.env'));
  await symlink(join(outside, 'secret'), join(root, '.env'));
  const result = await diagnose(root, probes);
  expect(result.exitCode).toBe(2);
  expect(JSON.stringify(result)).not.toContain('SECRET-outside');
});

it('informa versoes incompativeis e nao considera DB indisponivel pronto', async () => {
  const result = await diagnose(await fixture(), {
    ...probes,
    nodeVersion: '22.0.0',
    run: async () => ({ stdout: '10.0.0' }),
    database: async () => false,
  });
  expect(result.exitCode).toBe(1);
  for (const id of ['node', 'pnpm', 'database'])
    expect(result.checks.find((check: { id: string }) => check.id === id)?.status).toBe('failed');
});

it('retorna JSON unico e codigo estavel para IA inclusive argumentos invalidos', async () => {
  const root = await fixture();
  let output = '';
  expect(
    await doctorMain(
      root,
      ['--', '--json'],
      {
        write: (value: string) => {
          output += value;
        },
      },
      probes,
    ),
  ).toBe(0);
  expect(JSON.parse(output)).toMatchObject({ schemaVersion: 1, exitCode: 0, status: 'ready' });
  output = '';
  expect(
    await doctorMain(
      root,
      ['--json', '--token=SECRET-argument'],
      {
        write: (value: string) => {
          output += value;
        },
      },
      probes,
    ),
  ).toBe(2);
  expect(JSON.parse(output).exitCode).toBe(2);
  expect(output).not.toContain('SECRET-argument');
});
