import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import {
  prepareLocalDatabase,
  readLocalDatabase,
  runCompose,
  startDatabase,
} from '../../scripts/db/local.mjs';
import { migrateLocalDatabase } from '../../scripts/db/migrate.mjs';
import { runSetup, setupMain } from '../../scripts/project/setup.mjs';

const roots: string[] = [];
const config = {
  ...JSON.parse(await readFile(new URL('../../renova.project.json', import.meta.url), 'utf8')),
  profile: 'public',
  capabilities: [],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'renova-setup-'));
  roots.push(root);
  await writeFile(join(root, 'renova.project.json'), JSON.stringify(config));
  await mkdir(join(root, 'apps'));
  await writeFile(join(root, 'apps/product.txt'), 'custom product');
  return root;
}
const services = {
  prerequisites: async () => {},
  dependencies: async () => {},
  environment: prepareLocalDatabase,
  database: async () => {},
  migrations: async () => {},
};
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('executa CLI por caminho alternativo e imprime plano JSON sem aplicar', async () => {
  const root = await fixture();
  await cp(new URL('../../scripts', import.meta.url), join(root, 'scripts'), { recursive: true });
  const alias = await mkdtemp(join(tmpdir(), 'renova-setup-alias-'));
  roots.push(alias);
  await symlink(root, join(alias, 'project'));
  const { stdout } = await promisify(execFile)(process.execPath, [
    join(alias, 'project/scripts/project/setup.mjs'),
    '--config',
    'renova.project.json',
    '--plan',
    '--json',
  ]);
  expect(JSON.parse(stdout)).toMatchObject({ schemaVersion: 1, status: 'planned' });
  await expect(lstat(join(root, '.renova'))).rejects.toMatchObject({ code: 'ENOENT' });
});

it('retoma setup sem duplicar recursos ou apagar dados', async () => {
  const root = await fixture();
  await mkdir(join(root, 'scripts/db'), { recursive: true });
  for (const path of ['docker-compose.yml', 'scripts/db/init.sql']) {
    await cp(new URL(`../../${path}`, import.meta.url), join(root, path));
  }
  let started = false;
  const actual = {
    ...services,
    database: async (
      directory: string,
      handle: Awaited<ReturnType<typeof prepareLocalDatabase>>,
    ) => {
      started = true;
      await startDatabase(directory, handle);
    },
    migrations: async (
      _directory: string,
      handle: Awaited<ReturnType<typeof prepareLocalDatabase>>,
    ) => {
      await migrateLocalDatabase(handle);
    },
  };
  try {
    const first = await runSetup(root, config, {
      services: {
        ...actual,
        migrations: async (...args: Parameters<typeof actual.migrations>) => {
          await actual.migrations(...args);
          throw new Error('INTERRUPTED secret-sentinel');
        },
      },
    });
    expect(first.exitCode).toBe(1);
    const before = await readFile(join(root, '.env'));
    const identity = await readFile(join(root, '.renova/db-state.json'));
    const handle = await readLocalDatabase(root);
    const db = new pg.Client({ connectionString: handle.env.MIGRATION_DATABASE_URL });
    await db.connect();
    try {
      await db.query('create table public.setup_recovery_proof(value text)');
      await db.query("insert into public.setup_recovery_proof values ('user data survives')");
      const second = await runSetup(root, config, { services: actual });
      expect(second.exitCode).toBe(0);
      expect((await db.query('select value from public.setup_recovery_proof')).rows).toEqual([
        { value: 'user data survives' },
      ]);
      expect(await readFile(join(root, '.env'))).toEqual(before);
      expect(await readFile(join(root, '.renova/db-state.json'))).toEqual(identity);
      expect(await readFile(join(root, 'apps/product.txt'), 'utf8')).toBe('custom product');
      expect(await readFile(join(root, '.renova/setup-state.json'), 'utf8')).not.toContain(
        'secret-sentinel',
      );
      expect((await lstat(join(root, '.renova/setup-state.json'))).mode & 0o777).toBe(0o600);
    } finally {
      await db.end();
    }
  } finally {
    // Only this test-created temporary clone and its recorded identity are disposable.
    if (started) await runCompose(root, (await readLocalDatabase(root)).env, ['down', '--volumes']);
  }
}, 30_000);

it('planeja sem escrever nem exigir Docker e publica JSON sem ruido', async () => {
  const root = await fixture();
  let output = '';
  const code = await setupMain(root, ['--config', 'renova.project.json', '--plan', '--json'], {
    output: {
      write: (text: string) => {
        output += text;
      },
    },
  });
  expect(code).toBe(0);
  expect(JSON.parse(output)).toMatchObject({ schemaVersion: 1, status: 'planned', canApply: true });
  expect((await readdir(root)).sort()).toEqual(['apps', 'renova.project.json']);
});

it('recusa selecao sem TTY login sem receita e Railway antes de escrever', async () => {
  const root = await fixture();
  for (const args of [[], ['--json']]) {
    let output = '';
    expect(
      await setupMain(root, args, {
        input: { isTTY: false },
        output: {
          isTTY: false,
          write: (text: string) => {
            output += text;
          },
        },
      }),
    ).toBe(2);
    expect(output).toContain('--config');
  }
  for (const unsupported of [
    { ...config, profile: 'authenticated', capabilities: ['auth'] },
    { ...config, initialTarget: 'railway' },
  ]) {
    await expect(runSetup(root, unsupported, { services })).rejects.toMatchObject({ code: 2 });
  }
  expect((await readdir(root)).sort()).toEqual(['apps', 'renova.project.json']);
});

it('falha de pre requisito preserva clone e nao revela stderr ou ambiente', async () => {
  const root = await fixture();
  const before = await readFile(join(root, 'renova.project.json'));
  const result = await runSetup(root, config, {
    services: {
      ...services,
      prerequisites: async () => {
        throw new Error('postgres://secret-sentinel@host');
      },
    },
  });
  expect(result).toMatchObject({
    status: 'failed',
    exitCode: 1,
    steps: [{ id: 'prerequisites', status: 'failed' }],
  });
  expect(JSON.stringify(result)).not.toContain('secret-sentinel');
  expect(result.steps.at(-1)?.action).toContain('pnpm run doctor');
  expect(result.steps.at(-1)?.action).not.toContain('Instale');
  expect(result.nextActions).toContain('pnpm run setup -- --config renova.project.json --yes');
  expect(await readFile(join(root, 'renova.project.json'))).toEqual(before);
  expect((await readdir(root)).sort()).toEqual(['apps', 'renova.project.json']);
});

it('retoma falha de instalacao sem criar banco antecipadamente', async () => {
  const root = await fixture();
  const first = await runSetup(root, config, {
    services: {
      ...services,
      dependencies: async () => {
        throw new Error('offline');
      },
    },
  });
  expect(first.exitCode).toBe(1);
  expect(first.steps.at(-1)?.id).toBe('dependencies');
  await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await runSetup(root, config, { services })).exitCode).toBe(0);
  expect(await readFile(join(root, 'apps/product.txt'), 'utf8')).toBe('custom product');
});

it('recusa registro adulterado ou link sem alterar o arquivo externo', async () => {
  const root = await fixture();
  await mkdir(join(root, '.renova'));
  await writeFile(join(root, 'protected.txt'), 'external bytes');
  const state = join(root, '.renova/setup-state.json');
  await symlink(join(root, 'protected.txt'), state);
  await expect(runSetup(root, config, { services })).rejects.toMatchObject({ code: 2 });
  expect(await readFile(join(root, 'protected.txt'), 'utf8')).toBe('external bytes');
  await rm(state);
  await writeFile(state, '{invalid');
  await expect(runSetup(root, config, { services })).rejects.toMatchObject({ code: 2 });
  expect(await readFile(state, 'utf8')).toBe('{invalid');
});

it('um setup concorrente nao passa da instalacao nem muda identidade', async () => {
  const root = await fixture();
  let proceed: () => void = () => {};
  let reached: () => void = () => {};
  const ready = new Promise<void>((done) => {
    reached = done;
  });
  const pause = new Promise<void>((done) => {
    proceed = done;
  });
  const first = runSetup(root, config, {
    services: {
      ...services,
      dependencies: async () => {
        reached();
        await pause;
      },
    },
  });
  await ready;
  try {
    const second = await runSetup(root, config, { services });
    expect(second.exitCode).toBe(1);
    await expect(lstat(join(root, '.env'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    proceed();
  }
  expect((await first).exitCode).toBe(0);
});
