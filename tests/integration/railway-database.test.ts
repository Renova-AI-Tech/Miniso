import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkReadiness,
  migrations,
  runRailwayMigrations,
} from '../../packages/dbmigrator/src/index.js';
import { createTestDatabase, stopTestDatabase } from '../../scripts/db/local.mjs';
import {
  bootstrapRailwayDatabase,
  renderRailwayBootstrapSql,
} from '../../scripts/deploy/bootstrap.mjs';
import { readRailwayTarget } from '../../scripts/deploy/env.mjs';
import { predeploy } from '../../scripts/deploy/predeploy.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const RealClient = pg.Client;
type Handle = Awaited<ReturnType<typeof createTestDatabase>>;

describe('bootstrap e migração Railway em Postgres descartável real', () => {
  let handle: Handle;
  let admin: pg.Client;
  let env: Record<string, string>;
  let runtime: pg.Client;
  let bootstrapEnv: Record<string, string>;
  const database = 'renova_railway_test';

  beforeAll(async () => {
    handle = await createTestDatabase(root, 'railway-database');
    const adminUrl = new URL(handle.env.MIGRATION_DATABASE_URL);
    adminUrl.username = 'postgres';
    adminUrl.password = handle.env.POSTGRES_ADMIN_PASSWORD;
    adminUrl.pathname = '/postgres';
    admin = new RealClient({ connectionString: adminUrl.href });
    await admin.connect();
    // Somente o cluster descartável criado acima: prepara o estado do Postgres novo do provider.
    await admin.query(`DROP DATABASE ${pg.escapeIdentifier(handle.plan.databaseName)}`);
    await admin.query('DROP ROLE renova_runtime, renova_migrator');
    await admin.query(`CREATE DATABASE ${database}`);
    vi.spyOn(pg, 'Client').mockImplementation((config) => {
      const connection = new URL(config?.connectionString ?? '');
      if (connection.hostname !== 'test-postgres.railway.internal')
        throw new Error('Host de teste inválido');
      // Só o transporte é local; guardas, transações, locks, grants e SQL são de produção.
      connection.hostname = '127.0.0.1';
      connection.port = String(handle.plan.port);
      return new RealClient({ ...config, connectionString: connection.href });
    });
    const projectId = randomUUID();
    const environmentId = randomUUID();
    const base = `@test-postgres.railway.internal:5432/${database}`;
    env = {
      DEPLOY_TARGET: 'railway',
      NODE_ENV: 'production',
      RAILWAY_PROJECT_ID: projectId,
      RAILWAY_ENVIRONMENT_ID: environmentId,
      RAILWAY_SERVICE_ID: randomUUID(),
      RENOVA_DB_PROJECT_ID: projectId,
      RENOVA_DB_ENVIRONMENT_ID: environmentId,
      RENOVA_DB_NAME: database,
      MIGRATION_DATABASE_URL: `postgresql://renova_migrator:${handle.env.POSTGRES_MIGRATOR_PASSWORD}${base}`,
    };
    bootstrapEnv = {
      ...env,
      BOOTSTRAP_DATABASE_URL: `postgresql://postgres:${handle.env.POSTGRES_ADMIN_PASSWORD}${base}`,
      POSTGRES_MIGRATOR_PASSWORD: handle.env.POSTGRES_MIGRATOR_PASSWORD,
      POSTGRES_RUNTIME_PASSWORD: handle.env.POSTGRES_RUNTIME_PASSWORD,
      RENOVA_BOOTSTRAP_NEW_DATABASE: '1',
    };
    expect(await bootstrapRailwayDatabase(bootstrapEnv)).toEqual({ created: true });
    const runtimeUrl = new URL(handle.env.DATABASE_URL);
    runtimeUrl.pathname = `/${database}`;
    runtime = new RealClient({ connectionString: runtimeUrl.href });
    await runtime.connect();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await runtime?.end();
    await admin?.end();
    if (handle) await stopTestDatabase(root, handle);
  });

  it('o mesmo SQL roda no psql por stdin sem URL administrativa e recusa identidade divergente', async () => {
    const { BOOTSTRAP_DATABASE_URL: _adminUrl, ...socketEnv } = bootstrapEnv;
    const executeSql = (sql: string) =>
      new Promise<number | null>((accept, reject) => {
        const child = spawn(
          'docker',
          [
            'compose',
            '--file',
            `${root}/docker-compose.yml`,
            '--project-name',
            handle.plan.composeProject,
            'exec',
            '-T',
            'postgres',
            'psql',
            '-X',
            '-qAt',
            '-v',
            'ON_ERROR_STOP=1',
            '-U',
            'postgres',
            '-d',
            database,
          ],
          { env: { ...process.env, ...handle.env }, stdio: ['pipe', 'ignore', 'ignore'] },
        );
        child.once('error', reject);
        child.once('exit', accept);
        child.stdin.end(sql);
      });
    expect(await executeSql(renderRailwayBootstrapSql(socketEnv))).toBe(0);
    const foreign = randomUUID();
    expect(
      await executeSql(
        renderRailwayBootstrapSql({
          ...socketEnv,
          RAILWAY_PROJECT_ID: foreign,
          RENOVA_DB_PROJECT_ID: foreign,
        }),
      ),
    ).toBe(3);
    expect((await runtime.query('SELECT project_id FROM renova_bootstrap.identity')).rows).toEqual([
      { project_id: env.RENOVA_DB_PROJECT_ID },
    ]);
  });

  it('idempotente, identidade legível e runtime sem privilégios de DDL ou migrador', async () => {
    const hashes = await admin.query(
      "SELECT rolname, rolpassword FROM pg_authid WHERE rolname LIKE 'renova_%' ORDER BY rolname",
    );
    expect(hashes.rows).toHaveLength(2);
    for (const row of hashes.rows) expect(row.rolpassword).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(await bootstrapRailwayDatabase(bootstrapEnv)).toEqual({ created: false });
    await expect(
      bootstrapRailwayDatabase({ ...bootstrapEnv, POSTGRES_RUNTIME_PASSWORD: 'c'.repeat(64) }),
    ).rejects.toThrow('Bootstrap Railway recusado');
    expect(
      (
        await admin.query(
          "SELECT rolname, rolpassword FROM pg_authid WHERE rolname LIKE 'renova_%' ORDER BY rolname",
        )
      ).rows,
    ).toEqual(hashes.rows);
    expect(
      (await runtime.query('SELECT project_id, environment_id FROM renova_bootstrap.identity'))
        .rows,
    ).toEqual([
      {
        project_id: env.RENOVA_DB_PROJECT_ID,
        environment_id: env.RENOVA_DB_ENVIRONMENT_ID,
      },
    ]);
    for (const sql of [
      'CREATE TABLE public.forbidden(id int)',
      'CREATE SCHEMA forbidden',
      'SET ROLE renova_migrator',
      'DELETE FROM renova_bootstrap.identity',
    ])
      await expect(runtime.query(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('erro de bootstrap registrado no Postgres não revela senhas originais', async () => {
    const connection = new pg.Client({ connectionString: bootstrapEnv.BOOTSTRAP_DATABASE_URL });
    const foreign = randomUUID();
    const sql = renderRailwayBootstrapSql({
      ...bootstrapEnv,
      RAILWAY_PROJECT_ID: foreign,
      RENOVA_DB_PROJECT_ID: foreign,
    });
    try {
      await connection.connect();
      await connection.query("SET log_statement = 'all'");
      await expect(connection.query(sql)).rejects.toThrow('Bootstrap database identity mismatch');
    } finally {
      await connection.end();
    }
    const { stdout, stderr } = await promisify(execFile)(
      'docker',
      [
        'compose',
        '--file',
        `${root}/docker-compose.yml`,
        '--project-name',
        handle.plan.composeProject,
        'logs',
        '--no-color',
        'postgres',
      ],
      { env: { ...process.env, ...handle.env }, timeout: 5000, maxBuffer: 1024 * 1024 },
    );
    const logs = `${stdout}\n${stderr}`;
    expect(logs).toContain(foreign);
    expect(logs).toContain('SCRAM-SHA-256$4096:');
    expect(logs).not.toContain(bootstrapEnv.POSTGRES_RUNTIME_PASSWORD);
    expect(logs).not.toContain(bootstrapEnv.POSTGRES_MIGRATOR_PASSWORD);
    expect(logs).not.toContain(handle.env.POSTGRES_ADMIN_PASSWORD);
  });

  it('predeploy usa apenas migrador, serializa aplicações e preserva checksum', async () => {
    expect(await checkReadiness(runtime)).toBe(false);
    await expect(predeploy(bootstrapEnv)).rejects.toThrow('administrativa');
    const results = await Promise.all([predeploy(env), predeploy(env)]);
    expect(results.map((result) => result.applied).sort()).toEqual([0, migrations.length]);
    expect(await checkReadiness(runtime)).toBe(true);
    const changed = migrations.map((migration) => ({
      ...migration,
      sql: `${migration.sql}\n-- altered`,
    }));
    await expect(
      runRailwayMigrations(
        { ...readRailwayTarget(env), connectionString: env.MIGRATION_DATABASE_URL },
        changed,
      ),
    ).rejects.toMatchObject({ code: 'HISTORY_CHANGED' });
    expect(await checkReadiness(runtime, changed)).toBe(false);
    expect(await checkReadiness(runtime)).toBe(true);
  });

  it('recusa outro projeto/ambiente antes de alterar qualquer histórico ou identidade', async () => {
    const history = await runtime.query(
      'SELECT id, checksum FROM renova_meta.migrations ORDER BY id',
    );
    for (const field of ['projectId', 'environmentId']) {
      await expect(
        runRailwayMigrations({
          ...readRailwayTarget(env),
          [field]: randomUUID(),
          connectionString: env.MIGRATION_DATABASE_URL,
        }),
      ).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    }
    const foreign = randomUUID();
    await expect(
      bootstrapRailwayDatabase({
        ...bootstrapEnv,
        RAILWAY_ENVIRONMENT_ID: foreign,
        RENOVA_DB_ENVIRONMENT_ID: foreign,
      }),
    ).rejects.toThrow('Bootstrap Railway recusado');
    expect(
      (await runtime.query('SELECT id, checksum FROM renova_meta.migrations ORDER BY id')).rows,
    ).toEqual(history.rows);
    expect(
      (await runtime.query('SELECT environment_id FROM renova_bootstrap.identity')).rows,
    ).toEqual([{ environment_id: env.RENOVA_DB_ENVIRONMENT_ID }]);
  });

  it('runtime recusa outro projeto ambiente banco e papel mesmo com migrations iguais', async () => {
    const target = readRailwayTarget(env);
    expect(await checkReadiness(runtime, migrations, target)).toBe(true);
    for (const change of [
      { projectId: randomUUID() },
      { environmentId: randomUUID() },
      { expectedDatabase: 'another_database' },
    ]) {
      expect(await checkReadiness(runtime, migrations, { ...target, ...change })).toBe(false);
    }
    const migrator = new pg.Client({ connectionString: env.MIGRATION_DATABASE_URL });
    try {
      await migrator.connect();
      expect(await checkReadiness(migrator, migrations)).toBe(true);
      expect(await checkReadiness(migrator, migrations, target)).toBe(false);
    } finally {
      await migrator.end();
    }
    expect(await checkReadiness(runtime, migrations, target)).toBe(true);
  });

  it('falha faz rollback transacional e imagem anterior só fica pronta com o mesmo histórico', async () => {
    const target = { ...readRailwayTarget(env), connectionString: env.MIGRATION_DATABASE_URL };
    const next = {
      id: `${migrations.at(-1)?.id}_railway_addition`,
      sql: 'CREATE TABLE public.railway_added(id integer);',
    };
    const failing = [
      ...migrations,
      { ...next, sql: `${next.sql} SELECT missing_column FROM public.railway_added;` },
    ];
    await expect(runRailwayMigrations(target, failing)).rejects.toMatchObject({
      code: 'MIGRATION_FAILED',
    });
    expect(
      (await runtime.query("SELECT to_regclass('public.railway_added') AS added")).rows,
    ).toEqual([{ added: null }]);
    expect(await checkReadiness(runtime)).toBe(true);
    expect(await checkReadiness(runtime, failing)).toBe(false);
    expect(await runRailwayMigrations(target, [...migrations, next])).toEqual({
      applied: 1,
      version: next.id,
    });
    expect(await checkReadiness(runtime, [...migrations, next])).toBe(true);
    expect(await checkReadiness(runtime)).toBe(false);
    await expect(runRailwayMigrations(target)).rejects.toMatchObject({ code: 'HISTORY_CHANGED' });
    await expect(runtime.query('DELETE FROM renova_meta.migrations')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('recusa banco preexistente sem vínculo e preserva seu conteúdo', async () => {
    await admin.query('CREATE DATABASE railway_foreign');
    const foreignUrl = new URL(bootstrapEnv.BOOTSTRAP_DATABASE_URL);
    foreignUrl.pathname = '/railway_foreign';
    const foreign = new pg.Client({ connectionString: foreignUrl.href });
    await foreign.connect();
    try {
      await foreign.query(
        "CREATE TABLE public.existing(value text); INSERT INTO public.existing VALUES ('preserved')",
      );
      await expect(
        bootstrapRailwayDatabase({
          ...bootstrapEnv,
          RENOVA_DB_NAME: 'railway_foreign',
          BOOTSTRAP_DATABASE_URL: foreignUrl.href,
        }),
      ).rejects.toThrow('Bootstrap Railway recusado');
      expect((await foreign.query('SELECT value FROM public.existing')).rows).toEqual([
        { value: 'preserved' },
      ]);
      expect(
        (await foreign.query("SELECT to_regnamespace('renova_bootstrap') AS bootstrap")).rows,
      ).toEqual([{ bootstrap: null }]);
    } finally {
      await foreign.end();
    }
  });
});
