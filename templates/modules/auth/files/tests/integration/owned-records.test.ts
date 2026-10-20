import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthService } from '../../packages/auth/src/index.js';
import { createDatabase } from '../../apps/backend/src/database.js';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';
import { runMigrations } from '../../packages/dbmigrator/src/index.js';
import { createTestDatabase, stopTestDatabase } from '../../scripts/db/local.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'http://127.0.0.1:43123';
const password = 'Synthetic-owner-password-2026!';
type Jar = Map<string, string>;
let handle: Awaited<ReturnType<typeof createTestDatabase>>;
let settings: ReturnType<typeof parseEnv>;
let database: ReturnType<typeof createDatabase>;
let auth: ReturnType<typeof createAuthService>;
let app: Awaited<ReturnType<typeof createApp>>;
let inspection: pg.Pool;
let mailText = '';
const alice: Jar = new Map();
const bob: Jar = new Map();
function cookie(jar: Jar) {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorb(jar: Jar, headers: Record<string, unknown>) {
  const values = headers['set-cookie'];
  for (const value of Array.isArray(values) ? values : values ? [values] : []) {
    const pair = String(value).split(';')[0] ?? '';
    const index = pair.indexOf('=');
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
async function mutation(url: string, body: unknown, jar: Jar) {
  const csrf = await app.inject({ url: '/api/auth/csrf', headers: { cookie: cookie(jar) } });
  absorb(jar, csrf.headers);
  const response = await app.inject({
    method: 'POST',
    url,
    payload: body,
    headers: { cookie: cookie(jar), origin, 'x-csrf-token': csrf.json().token },
  });
  absorb(jar, response.headers);
  return response;
}
async function createUser(email: string, jar: Jar) {
  await auth.invite(email, 'Synthetic owner');
  const link = mailText.match(/http[^\s]+/)?.[0];
  if (!link) throw new Error('Expected a captured activation email.');
  const token = new URL(link).searchParams.get('token');
  expect(
    (await mutation('/api/auth/reset-password', { token, newPassword: password }, jar)).statusCode,
  ).toBe(200);
  expect((await mutation('/api/auth/sign-in/email', { email, password }, jar)).statusCode).toBe(
    200,
  );
}
async function list(jar: Jar, input: unknown = {}) {
  return app.inject({
    url: `/api/trpc/records.list?input=${encodeURIComponent(JSON.stringify(input))}`,
    headers: { cookie: cookie(jar) },
  });
}

describe('dados privados isolados por proprietario', () => {
  beforeAll(async () => {
    handle = await createTestDatabase(root, 'owned-records');
    await runMigrations({
      connectionString: handle.env.MIGRATION_DATABASE_URL,
      expectedDatabase: handle.plan.databaseName,
      projectId: handle.plan.projectId,
      target: 'test',
    });
    settings = parseEnv({
      ...handle.env,
      NODE_ENV: 'test',
      PROFILE: 'authenticated',
      FRONTEND_URL: origin,
      AUTH_SECRET: randomBytes(32).toString('hex'),
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      MAILPIT_PORT: '8025',
      AUTH_EMAIL_FROM: 'access@example.test',
    });
    database = createDatabase(settings);
    auth = createAuthService(settings, {
      sendMail: async (message) => {
        mailText = message.text;
      },
    });
    app = await createApp(settings, { ...database, auth, logStream: { write: () => {} } });
    inspection = new pg.Pool({ connectionString: handle.env.MIGRATION_DATABASE_URL, max: 1 });
    await createUser('alice@example.test', alice);
    await createUser('bob@example.test', bob);
  });
  afterAll(async () => {
    await app?.close();
    await auth?.close();
    await database?.close();
    await inspection?.end();
    if (handle) await stopTestDatabase(root, handle);
  });

  it('isola registros entre dois usuarios', async () => {
    const created = await mutation('/api/trpc/records.create', { title: 'Somente Alice' }, alice);
    expect(created.statusCode).toBe(200);
    const item = created.json().result.data;
    expect(item.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(item).not.toHaveProperty('owner_id');
    expect((await list(alice)).json().result.data.items).toContainEqual(item);
    expect((await list(bob)).json().result.data.items).toEqual([]);
    const denied = await mutation(
      '/api/trpc/records.update',
      { id: item.id, title: 'Ataque Bob' },
      bob,
    );
    expect(denied.statusCode).toBe(404);
    const updated = await mutation(
      '/api/trpc/records.update',
      { id: item.id, title: 'Editado por Alice' },
      alice,
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json().result.data.title).toBe('Editado por Alice');
  });
  it('persiste registros e sessoes ao reconstruir a API', async () => {
    const before = (await list(alice)).json().result.data;
    await app.close();
    app = await createApp(settings, { ...database, auth, logStream: { write: () => {} } });
    expect((await list(alice)).json().result.data).toEqual(before);
    expect(before.items.length).toBeGreaterThan(0);
  });
  it('nega leitura e escrita sem identidade e apos logout', async () => {
    expect((await list(new Map())).statusCode).toBe(401);
    expect(
      (await mutation('/api/trpc/records.create', { title: 'Anonimo' }, new Map())).statusCode,
    ).toBe(401);
    const separate: Jar = new Map();
    expect(
      (await mutation('/api/auth/sign-in/email', { email: 'bob@example.test', password }, separate))
        .statusCode,
    ).toBe(200);
    expect((await mutation('/api/auth/sign-out', {}, separate)).statusCode).toBe(200);
    expect((await list(separate)).statusCode).toBe(401);
  });
  it('valida titulo ownership e limites antes de gravar', async () => {
    const before = (
      await inspection.query('SELECT count(*)::int AS count FROM public.owned_records')
    ).rows[0].count;
    for (const input of [
      { title: '' },
      { title: '  ' },
      { title: 'x'.repeat(121) },
      { title: 'Trocar dono', owner_id: 'fake' },
    ]) {
      expect((await mutation('/api/trpc/records.create', input, alice)).statusCode).toBe(400);
    }
    for (const input of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { cursor: "' OR 1=1--" },
      { owner_id: 'fake' },
    ])
      expect((await list(alice, input)).statusCode).toBe(400);
    expect(
      (await inspection.query('SELECT count(*)::int AS count FROM public.owned_records')).rows[0]
        .count,
    ).toBe(before);
  });
  it('pagina sem repetir e nao concede escrita na tabela publica', async () => {
    await mutation('/api/trpc/records.create', { title: 'Segundo registro' }, alice);
    const first = (await list(alice, { limit: 1 })).json().result.data;
    const second = (await list(alice, { limit: 1, cursor: first.nextCursor })).json().result.data;
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    const runtime = new pg.Pool({ connectionString: handle.env.DATABASE_URL, max: 1 });
    try {
      await expect(
        runtime.query("UPDATE public.public_example_records SET title='forbidden'"),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await runtime.end();
    }
  });
  it('CSRF invalido nao altera registro nem usa ID conhecido como autorizacao', async () => {
    const before = (await list(alice)).json().result.data.items[0];
    const response = await app.inject({
      method: 'POST',
      url: '/api/trpc/records.update',
      payload: { id: before.id, title: 'Malicioso' },
      headers: { cookie: cookie(alice), origin, 'x-csrf-token': 'forged' },
    });
    expect(response.statusCode).toBe(403);
    const after = (await list(alice))
      .json()
      .result.data.items.find((row: { id: string }) => row.id === before.id);
    expect(after).toEqual(before);
  });
});
