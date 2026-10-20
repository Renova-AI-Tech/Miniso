import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkReadiness, migrations, runMigrations } from '../../packages/dbmigrator/src/index.js';
import { createTestDatabase, stopTestDatabase } from '../../scripts/db/local.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const latestMigrationId = migrations.at(-1)?.id ?? '';
type Handle = Awaited<ReturnType<typeof createTestDatabase>>;
const target = (handle: Handle) => ({
  connectionString: handle.env.MIGRATION_DATABASE_URL,
  expectedDatabase: handle.plan.databaseName,
  projectId: handle.plan.projectId,
  target: 'test' as const,
});
const pool = (handle: Handle) =>
  new pg.Pool({ connectionString: handle.env.DATABASE_URL, connectionTimeoutMillis: 2000, max: 2 });

describe('migrations transacionais e readiness', () => {
  const databases: Handle[] = [];
  beforeAll(async () => {
    for (const slug of [
      'migration-normal',
      'migration-race',
      'migration-failure',
      'migration-evolution',
    ]) {
      databases.push(await createTestDatabase(root, slug));
    }
  });
  afterAll(async () => {
    await Promise.all(databases.map((handle) => stopTestDatabase(root, handle)));
  });

  it('evolui banco vazio, preserva seed idempotente e libera somente leitura', async () => {
    const handle = databases[0];
    const runtime = pool(handle);
    try {
      expect(await checkReadiness(runtime)).toBe(false);
      expect(await runMigrations(target(handle))).toEqual({
        applied: migrations.length,
        version: latestMigrationId,
      });
      expect(await runMigrations(target(handle))).toEqual({
        applied: 0,
        version: latestMigrationId,
      });
      expect(await checkReadiness(runtime)).toBe(true);
      const rows = await runtime.query(
        'select id, title from public.public_example_records order by id',
      );
      expect(rows.rows.map((row) => row.id)).toEqual([
        '01-primeiro-projeto',
        '02-design-system',
        '03-proximo-passo',
      ]);
      await expect(
        runtime.query(
          "insert into public.public_example_records(id,title,description) values ('denied','Denied','Denied')",
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(runtime.query('delete from renova_meta.migrations')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await runtime.end();
    }
  });

  it('serializa migrations e recusa historico alterado', async () => {
    const handle = databases[1];
    const results = await Promise.all([
      runMigrations(target(handle)),
      runMigrations(target(handle)),
    ]);
    expect(results.map((result) => result.applied).sort()).toEqual([0, migrations.length]);
    const altered = migrations.map((migration) => ({
      ...migration,
      sql: `${migration.sql}\n-- changed`,
    }));
    await expect(runMigrations(target(handle), altered)).rejects.toMatchObject({
      code: 'HISTORY_CHANGED',
    });
    const runtime = pool(handle);
    try {
      expect(await checkReadiness(runtime)).toBe(true);
      expect(await checkReadiness(runtime, altered)).toBe(false);
      expect(
        (await runtime.query('select count(*)::int as count from renova_meta.migrations')).rows,
      ).toEqual([{ count: migrations.length }]);
    } finally {
      await runtime.end();
    }
  });

  it('recusa migration aplicada removida do manifesto', async () => {
    const handle = databases[0];
    await runMigrations(target(handle));
    await expect(runMigrations(target(handle), [])).rejects.toMatchObject({
      code: 'HISTORY_CHANGED',
    });
  });

  it('mantém readiness ao remover o exemplo por uma nova migration válida', async () => {
    const handle = databases[3];
    // O sufixo mantém a migration de teste após a última do projeto, sem colisão.
    const removeExample = {
      id: `${latestMigrationId || '000'}_test_remove_example`,
      sql: 'DROP TABLE public.public_example_records;',
    };
    const evolved = [...migrations, removeExample];
    const runtime = pool(handle);
    try {
      await runMigrations(target(handle));
      expect(await checkReadiness(runtime, evolved)).toBe(false);
      expect(await runMigrations(target(handle), evolved)).toEqual({
        applied: 1,
        version: removeExample.id,
      });
      expect(
        (await runtime.query("select to_regclass('public.public_example_records') as example"))
          .rows,
      ).toEqual([{ example: null }]);
      expect(await checkReadiness(runtime, evolved)).toBe(true);
      expect(await checkReadiness(runtime, migrations)).toBe(false);
      expect(await runMigrations(target(handle), evolved)).toEqual({
        applied: 0,
        version: removeExample.id,
      });
    } finally {
      await runtime.end();
    }
  });

  it('falha de migration não deixa schema ou histórico parcialmente aplicado', async () => {
    const handle = databases[2];
    const failing = [
      ...migrations,
      {
        id: `${latestMigrationId || '000'}_test_failure`,
        sql: 'CREATE TABLE public.partial_result(id int); SELECT missing_column FROM public.public_example_records;',
      },
    ];
    await expect(runMigrations(target(handle), failing)).rejects.toMatchObject({
      code: 'MIGRATION_FAILED',
    });
    const runtime = pool(handle);
    try {
      expect(await checkReadiness(runtime, failing)).toBe(false);
      expect(
        (
          await runtime.query(
            "select to_regclass('public.partial_result')::text as partial, to_regclass('public.public_example_records')::text as example",
          )
        ).rows,
      ).toEqual([{ partial: null, example: null }]);
      expect((await runMigrations(target(handle))).applied).toBe(migrations.length);
      expect(await checkReadiness(runtime)).toBe(true);
    } finally {
      await runtime.end();
    }
  });

  it('verifica identidade vinculada antes de escrever migrations', async () => {
    const handle = databases[0];
    await expect(
      runMigrations({ ...target(handle), projectId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject({ code: 'IDENTITY_MISMATCH' });
    await expect(
      runMigrations({
        ...target(handle),
        connectionString: handle.env.MIGRATION_DATABASE_URL.replace('127.0.0.1', 'remote.example'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TARGET' });
  });

  it('recusa manifesto fora de ordem antes de conectar', async () => {
    await expect(
      runMigrations(target(databases[0]), [
        { id: '002_second', sql: 'select 1' },
        { id: '001_first', sql: 'select 1' },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('schema real corresponde ao contrato compartilhado', async () => {
    const handle = databases[0];
    await runMigrations(target(handle));
    const runtime = pool(handle);
    try {
      const columns = await runtime.query(
        "select column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name='public_example_records' order by ordinal_position",
      );
      expect(columns.rows).toEqual([
        { column_name: 'id', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'title', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'description', data_type: 'text', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);
    } finally {
      await runtime.end();
    }
  });

  it('banco indisponível torna readiness falsa sem detalhe externo', async () => {
    const runtime = pool(databases[0]);
    await runtime.end();
    expect(await checkReadiness(runtime)).toBe(false);
  });
});
