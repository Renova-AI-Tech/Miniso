import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import Fastify from 'fastify';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerSecurity } from '../../../apps/backend/src/server/security.js';
import { createTestDatabase, stopTestDatabase } from '../../../scripts/db/local.mjs';

function present<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('Expected experiment evidence.');
  return value;
}

const root = fileURLToPath(new URL('../../../', import.meta.url));
const origin = 'http://127.0.0.1:43123';
const secret = randomBytes(32).toString('hex');
const password = 'Synthetic-access-password-2026!';
const messages: { email: string; token: string }[] = [];
let handle: Awaited<ReturnType<typeof createTestDatabase>>;
let pool: pg.Pool;
let database: Kysely<unknown>;
let auth: ReturnType<typeof betterAuth>;
let app: ReturnType<typeof Fastify>;
let proxy: ReturnType<typeof Fastify>;

async function post(path: string, body: unknown, cookie?: string, chosenOrigin = origin) {
  return app.inject({
    method: 'POST',
    url: `/api/auth/${path}`,
    payload: body,
    headers: { origin: chosenOrigin, ...(cookie ? { cookie, 'x-csrf-token': 'spike-proof' } : {}) },
  });
}
function cookies(response: Awaited<ReturnType<typeof post>>) {
  const values = response.headers['set-cookie'];
  return (Array.isArray(values) ? values : [values])
    .filter(Boolean)
    .map((v) => String(v).split(';')[0])
    .join('; ');
}
async function provision(email: string) {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: 'Synthetic user', email, emailVerified: false },
    { method: 'email-password' },
  );
  await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await context.password.hash(randomBytes(32).toString('hex')),
  });
  await auth.api.requestPasswordReset({ body: { email, redirectTo: `${origin}/ativar` } });
  return user;
}

describe('S0 Better Auth 1.7.11 / Fastify / Postgres', () => {
  beforeAll(async () => {
    handle = await createTestDatabase(root, 'auth-spike');
    pool = new pg.Pool({ connectionString: handle.env.MIGRATION_DATABASE_URL, max: 3 });
    database = new Kysely({ dialect: new PostgresDialect({ pool }) });
    auth = betterAuth({
      baseURL: origin,
      secret,
      database: { db: database, type: 'postgres', transaction: true },
      trustedOrigins: [origin],
      logger: { disabled: true },
      emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        autoSignIn: false,
        requireEmailVerification: true,
        minPasswordLength: 15,
        maxPasswordLength: 128,
        resetPasswordTokenExpiresIn: 900,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, token }) => {
          messages.push({ email: user.email, token });
        },
        onPasswordReset: async ({ user }) => {
          await (await auth.$context).internalAdapter.updateUser(user.id, { emailVerified: true });
        },
      },
      session: { expiresIn: 28800, disableSessionRefresh: true, cookieCache: { enabled: false } },
      rateLimit: {
        enabled: true,
        storage: 'database',
        customRules: { '/sign-in/email': { window: 900, max: 5 } },
      },
    });
    await (await getMigrations(auth.options)).runMigrations();
    app = Fastify();
    registerSecurity(app, {
      origin,
      verifyCsrf: async (_request, token) => token === 'spike-proof',
    });
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      config: { accessPolicy: 'public' },
      async handler(request, reply) {
        const response = await auth.handler(
          new Request(new URL(request.url, origin), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          }),
        );
        reply.status(response.status);
        for (const [key, value] of response.headers)
          if (key !== 'set-cookie') reply.header(key, value);
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length) reply.header('set-cookie', setCookies);
        return reply.send(await response.text());
      },
    });
    const upstream = await app.listen({ host: '127.0.0.1', port: 0 });
    proxy = Fastify();
    proxy.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      async handler(request, reply) {
        const response = await fetch(new URL(request.url, upstream), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });
        reply.status(response.status);
        for (const [key, value] of response.headers)
          if (key !== 'set-cookie') reply.header(key, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.send(await response.text());
      },
    });
  });
  afterAll(async () => {
    await proxy?.close();
    await app?.close();
    await database?.destroy();
    if (handle) await stopTestDatabase(root, handle);
  });
  it('comprova integracao auth com Fastify e proxy', async () => {
    await provision('first@example.test');
    expect(
      (await post('sign-up/email', { name: 'Bad', email: 'new@example.test', password }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('sign-in/email', { email: 'first@example.test', password })).statusCode,
    ).toBe(401);
    const message = present(messages.at(-1));
    expect(
      (await post('reset-password', { token: message.token, newPassword: password })).statusCode,
    ).toBe(200);
    const login = await proxy.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: message.email, password, rememberMe: false },
      headers: { origin },
    });
    expect(login.statusCode).toBe(200);
    expect(Array.isArray(login.headers['set-cookie'])).toBe(true);
    expect(present(login.headers['set-cookie']).length).toBeGreaterThan(1);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(login.headers['set-cookie'])).toContain('SameSite=Lax');
    const session = await app.inject({
      url: '/api/auth/get-session',
      headers: { cookie: cookies(login) },
    });
    expect(session.json().user.email).toBe(message.email);
    expect((await post('sign-out', {}, cookies(login))).statusCode).toBe(200);
    expect(
      (
        await app.inject({ url: '/api/auth/get-session', headers: { cookie: cookies(login) } })
      ).json(),
    ).toBeNull();
  });
  it('recusa origem maliciosa e mantem link usavel apos senha curta', async () => {
    await provision('origin@example.test');
    const token = present(messages.at(-1)).token;
    expect(
      (
        await post(
          'reset-password',
          { token, newPassword: password },
          undefined,
          'https://evil.example',
        )
      ).statusCode,
    ).toBe(403);
    expect((await post('reset-password', { token, newPassword: 'short' })).statusCode).toBe(400);
    expect((await post('reset-password', { token, newPassword: password })).statusCode).toBe(200);
  });
  it('consome token uma unica vez inclusive com pedidos concorrentes', async () => {
    await provision('replay@example.test');
    const token = present(messages.at(-1)).token;
    const results = await Promise.all([
      post('reset-password', { token, newPassword: password }),
      post('reset-password', { token, newPassword: `${password}B` }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect((await post('reset-password', { token, newPassword: password })).statusCode).toBe(400);
  });
  it('expira token aos quinze minutos e sessao em oito horas sem renovar', async () => {
    await provision('expiry@example.test');
    const token = present(messages.at(-1)).token;
    const row = await pool.query(
      'SELECT "expiresAt", "createdAt" FROM verification WHERE identifier=$1',
      [`reset-password:${token}`],
    );
    expect(row.rows[0].expiresAt.getTime() - row.rows[0].createdAt.getTime()).toBeGreaterThan(
      899000,
    );
    expect(row.rows[0].expiresAt.getTime() - row.rows[0].createdAt.getTime()).toBeLessThanOrEqual(
      900000,
    );
    await pool.query(
      'UPDATE verification SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 second\' WHERE identifier=$1',
      [`reset-password:${token}`],
    );
    expect((await post('reset-password', { token, newPassword: password })).statusCode).toBe(400);
    await auth.api.requestPasswordReset({ body: { email: 'expiry@example.test' } });
    expect(
      (
        await post('reset-password', {
          token: present(messages.at(-1)).token,
          newPassword: password,
        })
      ).statusCode,
    ).toBe(200);
    await pool.query('DELETE FROM "rateLimit"');
    const login = await post('sign-in/email', { email: 'expiry@example.test', password });
    expect(login.statusCode).toBe(200);
    const active = await auth.api.getSession({ headers: new Headers({ cookie: cookies(login) }) });
    expect(
      present(active).session.expiresAt.getTime() - present(active).session.createdAt.getTime(),
    ).toBeGreaterThan(28799000);
    expect(
      present(active).session.expiresAt.getTime() - present(active).session.createdAt.getTime(),
    ).toBeLessThanOrEqual(28800000);
    await pool.query('UPDATE session SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 second\'');
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: cookies(login) }) }),
    ).toBeNull();
  });
  it('recuperacao revoga sessoes e nao revela email inexistente', async () => {
    await provision('recover@example.test');
    await post('reset-password', { token: present(messages.at(-1)).token, newPassword: password });
    await pool.query('DELETE FROM "rateLimit"');
    const login = await post('sign-in/email', { email: 'recover@example.test', password });
    const yes = await post('request-password-reset', { email: 'recover@example.test' });
    const no = await post('request-password-reset', { email: 'missing@example.test' });
    expect(yes.json()).toEqual(no.json());
    expect(
      (
        await post('reset-password', {
          token: present(messages.at(-1)).token,
          newPassword: `${password}B`,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: cookies(login) }) }),
    ).toBeNull();
  });
  it('persiste limite por IP e bloqueia concorrencia acima do limite', async () => {
    await pool.query('DELETE FROM "rateLimit"');
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        post('sign-in/email', { email: 'missing@example.test', password }),
      ),
    );
    expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(5);
    expect(responses.filter((r) => r.statusCode === 429)).toHaveLength(3);
    const count = await pool.query('SELECT count FROM "rateLimit" WHERE key LIKE $1', [
      '%/sign-in/email',
    ]);
    expect(count.rows[0].count).toBe(5);
  });
});
