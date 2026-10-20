import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../../apps/backend/src/database.js';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';
import { runMigrations } from '../../packages/dbmigrator/src/index.js';
import { createTestDatabase, stopTestDatabase } from '../../scripts/db/local.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
type Handle = Awaited<ReturnType<typeof createTestDatabase>>;

describe('referencia publica dentro do perfil autenticado', () => {
  let handle: Handle;
  let database: ReturnType<typeof createDatabase>;
  let app: Awaited<ReturnType<typeof createApp>>;
  let inspection: pg.Pool;
  beforeAll(async () => {
    handle = await createTestDatabase(root, 'public-profile');
    await runMigrations({
      connectionString: handle.env.MIGRATION_DATABASE_URL,
      expectedDatabase: handle.plan.databaseName,
      projectId: handle.plan.projectId,
      target: 'test',
    });
    const env = parseEnv({ ...handle.env, NODE_ENV: 'test' });
    database = createDatabase(env);
    app = await createApp(env, { ...database, logStream: { write: () => {} } });
    inspection = new pg.Pool({ connectionString: handle.env.DATABASE_URL, max: 1 });
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
    await inspection?.end();
    if (handle) await stopTestDatabase(root, handle);
  });

  it('perfil publico consulta dados sinteticos sem writer', async () => {
    const response = await app.inject('/api/trpc/public.list');
    expect(response.statusCode).toBe(200);
    expect(response.json().result.data).toEqual({
      items: [
        {
          id: '01-primeiro-projeto',
          title: 'Seu primeiro projeto',
          description: 'Exemplo sintético e público. Substitua pelo conteúdo da sua aplicação.',
        },
        {
          id: '02-design-system',
          title: 'Design system Renova',
          description: 'Componentes e identidade visual já fazem parte deste repositório.',
        },
        {
          id: '03-proximo-passo',
          title: 'Desenvolva sua ideia',
          description: 'O frontend consulta esta lista no Postgres por uma API somente leitura.',
        },
      ],
      nextCursor: null,
    });
    const readiness = await app.inject('/ready');
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({ status: 'ready' });
  });

  it('pagina por cursor sem repetir registros nem expor campos internos', async () => {
    const first = await app.inject(
      `/api/trpc/public.list?input=${encodeURIComponent(JSON.stringify({ limit: 2 }))}`,
    );
    const firstPage = first.json().result.data;
    expect(firstPage.items.map((item: { id: string }) => item.id)).toEqual([
      '01-primeiro-projeto',
      '02-design-system',
    ]);
    expect(firstPage.nextCursor).toBe('02-design-system');
    const last = await app.inject(
      `/api/trpc/public.list?input=${encodeURIComponent(JSON.stringify({ limit: 2, cursor: firstPage.nextCursor }))}`,
    );
    expect(last.json().result.data).toMatchObject({
      items: [{ id: '03-proximo-passo' }],
      nextCursor: null,
    });
    expect(Object.keys(firstPage.items[0]).sort()).toEqual(['description', 'id', 'title']);
  });

  it('recusa limites invalidos campos extras e tentativa de injetar SQL no cursor', async () => {
    for (const input of [
      { limit: 101 },
      { limit: 0 },
      { limit: 1.5 },
      { cursor: "' OR 1=1 --" },
      { admin: true },
    ]) {
      const response = await app.inject(
        `/api/trpc/public.list?input=${encodeURIComponent(JSON.stringify(input))}`,
      );
      expect(response.statusCode).toBe(400);
    }
    const rows = await inspection.query(
      'SELECT count(*)::integer as count FROM public.public_example_records',
    );
    expect(rows.rows).toEqual([{ count: 3 }]);
  });

  it('recusa escrita via HTTP e via credencial runtime do banco', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/trpc/public.list',
        payload: '{}',
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(405);
    }
    for (const sql of [
      "INSERT INTO public.public_example_records(id,title,description) VALUES('forbidden','forbidden','forbidden')",
      "UPDATE public.public_example_records SET title = 'forbidden'",
      'DELETE FROM public.public_example_records',
    ]) {
      await expect(inspection.query(sql)).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('mantem referencia publica somente leitura sem cadastro nem mutation publica', async () => {
    for (const url of ['/api/auth/sign-in', '/api/auth/sign-up', '/api/trpc/public.create']) {
      expect((await app.inject(url)).statusCode).toBe(404);
    }
    const tables = await inspection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(tables.rows).toEqual(
      [
        'auth_account',
        'auth_account_limits',
        'auth_rate_limit',
        'auth_session',
        'auth_user',
        'auth_verification',
        'owned_records',
        'public_example_records',
      ].map((table_name) => ({ table_name })),
    );
    for (const url of ['/api/auth/sign-up/email', '/api/auth/admin/create-user']) {
      const response = await app.inject({ method: 'POST', url, payload: {} });
      expect([403, 404]).toContain(response.statusCode);
    }
    expect((await app.inject('/api/trpc/records.list')).statusCode).toBe(401);
  });

  it('retorna indisponivel sem detalhes quando a conexao de banco foi encerrada', async () => {
    const env = parseEnv({ ...handle.env, NODE_ENV: 'test' });
    const closed = createDatabase(env);
    const unavailable = await createApp(env, { ...closed, logStream: { write: () => {} } });
    try {
      await closed.close();
      expect((await unavailable.inject('/health')).statusCode).toBe(200);
      const ready = await unavailable.inject('/ready');
      expect(ready.statusCode).toBe(503);
      const query = await unavailable.inject('/api/trpc/public.list');
      expect(query.statusCode).toBe(503);
      expect(query.body).not.toContain(handle.env.DATABASE_URL);
      expect(query.body).not.toContain('stack');
    } finally {
      await unavailable.close();
    }
  });
});
