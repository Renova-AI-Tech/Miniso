import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertLocalDatabaseTarget,
  assertPortAvailable,
  createTestDatabase,
  planLocalDatabase,
  runCompose,
  stopTestDatabase,
} from '../../scripts/db/local.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

describe('isolamento do Postgres local', () => {
  const databases: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
  beforeAll(async () => {
    databases.push(await createTestDatabase(root, 'first-project'));
    databases.push(await createTestDatabase(root, 'second-project'));
  });
  afterAll(async () => {
    await Promise.all(databases.map((handle) => stopTestDatabase(root, handle)));
  });
  it('isola clones locais com mesmo slug por raiz e mantém identidade estável', async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'renova-local-plans-'));
    try {
      const clonePaths = [join(fixtureRoot, 'first-clone'), join(fixtureRoot, 'second-clone')];
      await Promise.all(clonePaths.map((path) => mkdir(path)));
      const [firstRoot, secondRoot] = await Promise.all(clonePaths.map((path) => realpath(path)));
      const shared = {
        projectSlug: 'same-project',
        target: 'local',
        port: 61234,
        projectId: '00000000-0000-0000-0000-000000000001',
      };
      const first = planLocalDatabase({ ...shared, projectRoot: firstRoot });
      const second = planLocalDatabase({ ...shared, projectRoot: secondRoot });
      expect(first.databaseName).not.toBe(second.databaseName);
      expect(first.volumeName).not.toBe(second.volumeName);
      expect(first.composeProject).not.toBe(second.composeProject);
      expect(first.rootIdentity).not.toBe(second.rootIdentity);
      expect(planLocalDatabase({ ...shared, projectRoot: firstRoot })).toEqual(first);
      expect(first.databaseName).toMatch(/_local$/);
      expect(second.databaseName).toMatch(/_local$/);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('isola dois projetos locais e recusa alvo proibido', async () => {
    const [first, second] = databases;
    expect(first.plan.databaseName).not.toBe(second.plan.databaseName);
    expect(first.plan.volumeName).not.toBe(second.plan.volumeName);
    expect(first.plan.port).not.toBe(second.plan.port);
    for (const handle of [first, second]) {
      const client = new pg.Client({ connectionString: handle.env.MIGRATION_DATABASE_URL });
      await client.connect();
      try {
        const identity = await client.query(
          'select current_database() as name, project_id from renova_bootstrap.identity',
        );
        expect(identity.rows).toEqual([
          { name: handle.plan.databaseName, project_id: handle.plan.projectId },
        ]);
      } finally {
        await client.end();
      }
    }
    expect(() =>
      assertLocalDatabaseTarget(first.env.DATABASE_URL, {
        expectedDatabase: second.plan.databaseName,
        target: 'test',
      }),
    ).toThrow('Alvo recusado');
  });

  it('publica Postgres exclusivamente em loopback', async () => {
    const handle = databases[0];
    const result = await runCompose(root, handle.env, ['port', 'postgres', '5432']);
    expect(result.stdout.trim()).toBe(`127.0.0.1:${handle.plan.port}`);
  });

  it('recusa host remoto antes de qualquer conexão', () => {
    expect(() =>
      assertLocalDatabaseTarget(
        'postgresql://renova_migrator:secret@remote.example:5432/renova_123456789abc_test',
        { expectedDatabase: 'renova_123456789abc_test', target: 'test' },
      ),
    ).toThrow('Alvo recusado');
  });

  it('recusa desvio por parâmetros de conexão e banco não descartável', () => {
    for (const url of [
      'postgresql://renova_migrator:secret@127.0.0.1:5432/renova_123456789abc_test?host=remote.example',
      'postgresql://renova_migrator:secret@127.0.0.1:5432/renova_123456789abc_local',
    ]) {
      expect(() =>
        assertLocalDatabaseTarget(url, {
          expectedDatabase: 'renova_123456789abc_test',
          target: 'test',
        }),
      ).toThrow('Alvo recusado');
    }
  });

  it('preserva processo que ocupa uma porta local', async () => {
    const server = createServer();
    await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test port');
      await expect(assertPortAvailable(address.port)).rejects.toThrow('Porta ocupada');
      expect(server.listening).toBe(true);
    } finally {
      await new Promise<void>((accept) => server.close(() => accept()));
    }
  });

  it('runtime não é superusuário e não pode criar objetos ou assumir migrador', async () => {
    const handle = databases[0];
    const client = new pg.Client({ connectionString: handle.env.DATABASE_URL });
    try {
      await client.connect();
      const role = await client.query(
        'select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user',
      );
      expect(role.rows).toEqual([{ rolsuper: false, rolcreatedb: false, rolcreaterole: false }]);
      await expect(client.query('create table public.forbidden(id int)')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(client.query('set role renova_migrator')).rejects.toMatchObject({
        code: '42501',
      });
      const timeout = await client.query('show statement_timeout');
      expect(timeout.rows[0].statement_timeout).toBe('5s');
    } finally {
      await client.end();
    }
  });

  it('recusa limpeza de volume local persistente', async () => {
    await expect(stopTestDatabase(root, { plan: { target: 'local' }, env: {} })).rejects.toThrow(
      'Limpeza recusada',
    );
  });
});
