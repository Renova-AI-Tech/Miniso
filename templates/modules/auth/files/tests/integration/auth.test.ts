import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthService, type AuthMail } from '../../packages/auth/src/index.js';
import { createDatabase } from '../../apps/backend/src/database.js';
import { parseEnv } from '../../apps/backend/src/env.js';
import { createApp } from '../../apps/backend/src/server/app.js';
import { runMigrations } from '../../packages/dbmigrator/src/index.js';
import { createTestDatabase, stopTestDatabase } from '../../scripts/db/local.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const password = 'Synthetic-access-password-2026!';
const origin = 'http://127.0.0.1:43123';
type Jar = Map<string, string>;
let handle: Awaited<ReturnType<typeof createTestDatabase>>;
let database: ReturnType<typeof createDatabase>;
let auth: ReturnType<typeof createAuthService>;
let app: Awaited<ReturnType<typeof createApp>>;
let inspection: pg.Pool;
let settings: ReturnType<typeof parseEnv>;
let deliveryFails = false;
let messages: AuthMail[] = [];
const events: string[] = [];
function absorb(jar: Jar, headers: Record<string, unknown>) {
  const cookies = headers['set-cookie'];
  for (const cookie of Array.isArray(cookies) ? cookies : cookies ? [cookies] : []) {
    const pair = String(cookie).split(';')[0] ?? '';
    const at = pair.indexOf('=');
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
}
function cookie(jar: Jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
}
async function post(path: string, payload: unknown, jar: Jar = new Map(), ip = '127.0.0.1') {
  const proof = await app.inject({
    url: '/api/auth/csrf',
    headers: { cookie: cookie(jar) },
    remoteAddress: ip,
  });
  absorb(jar, proof.headers);
  const response = await app.inject({
    method: 'POST',
    url: `/api/auth/${path}`,
    payload,
    remoteAddress: ip,
    headers: { cookie: cookie(jar), origin, 'x-csrf-token': proof.json().token },
  });
  absorb(jar, response.headers);
  return response;
}
function token() {
  const link = messages.at(-1)?.text.match(/http[^\s]+/)?.[0];
  if (!link) throw new Error('Expected a captured activation email.');
  const value = new URL(link).searchParams.get('token');
  if (!value) throw new Error('Expected an activation token.');
  return value;
}
async function activate(email: string, jar: Jar = new Map()) {
  await auth.invite(email, 'Synthetic person');
  const result = await post('reset-password', { token: token(), newPassword: password });
  expect(result.statusCode).toBe(200);
  const login = await post('sign-in/email', { email, password }, jar);
  expect(login.statusCode).toBe(200);
  return jar;
}

describe('identidade opcional com Postgres real', () => {
  beforeAll(async () => {
    handle = await createTestDatabase(root, 'auth');
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
        if (deliveryFails) throw new Error('SENTINEL_SMTP_SECRET');
        messages.push(message);
      },
      onEvent: (event) => events.push(event),
    });
    app = await createApp(settings, { ...database, auth, logStream: { write: () => {} } });
    inspection = new pg.Pool({ connectionString: handle.env.MIGRATION_DATABASE_URL, max: 2 });
  });
  beforeEach(async () => {
    deliveryFails = false;
    messages = [];
    events.length = 0;
    await inspection.query(
      'DELETE FROM public.auth_rate_limit; DELETE FROM public.auth_account_limits',
    );
  });
  afterAll(async () => {
    await app?.close();
    await auth?.close();
    await database?.close();
    await inspection?.end();
    if (handle) await stopTestDatabase(root, handle);
  });

  it('revoga sessao e bloqueia cadastro publico', async () => {
    const jar = await activate('closed@example.test');
    expect(
      (await post('sign-up/email', { email: 'attacker@example.test', name: 'Attacker', password }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await post('admin/create-user', {
          email: 'attacker@example.test',
          name: 'Attacker',
          password,
        })
      ).statusCode,
    ).toBe(404);
    const session = await app.inject({
      url: '/api/auth/get-session',
      headers: { cookie: cookie(jar) },
    });
    expect(session.json().user.email).toBe('closed@example.test');
    expect(JSON.stringify(session.json())).not.toContain('token');
    expect((await post('sign-out', {}, jar)).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/auth/get-session', headers: { cookie: cookie(jar) } })).json(),
    ).toBeNull();
    const records = await inspection.query('SELECT email FROM public.auth_user WHERE email=$1', [
      'attacker@example.test',
    ]);
    expect(records.rows).toEqual([]);
  });
  it('mantem conta pendente sem sessao e nunca expoe senha nem token de sessao', async () => {
    await auth.invite('pending@example.test', 'Pendente');
    expect(
      (await post('sign-in/email', { email: 'pending@example.test', password })).statusCode,
    ).toBe(401);
    expect(
      (
        await inspection.query('SELECT "emailVerified" FROM public.auth_user WHERE email=$1', [
          'pending@example.test',
        ])
      ).rows[0].emailVerified,
    ).toBe(false);
    const reset = await post('reset-password', { token: token(), newPassword: password });
    expect(reset.statusCode).toBe(200);
    const login = await post('sign-in/email', { email: 'pending@example.test', password });
    expect(Object.keys(login.json())).toEqual(['user']);
    expect(login.body).not.toContain(password);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(login.headers['set-cookie'])).toContain('SameSite=Lax');
    await expect(auth.invite('pending@example.test', 'Pendente')).rejects.toThrow('Conta já ativa');
  });
  it('em produção mantém sessão e prova CSRF Secure sem domínio amplo', async () => {
    await activate('secure-cookie@example.test');
    // The test retains its disposable DB; only the HTTP/cookie policy changes.
    const production = createAuthService(
      {
        ...settings,
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://app.example.com',
        RESEND_API_KEY: 're_SYNTHETIC_NOT_SENT',
      },
      { sendMail: async () => {} },
    );
    try {
      const response = await production.handle(
        new Request('https://app.example.com/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
          body: JSON.stringify({ email: 'secure-cookie@example.test', password }),
        }),
        '192.0.2.30',
      );
      expect(response.status).toBe(200);
      const session = response.headers
        .getSetCookie()
        .find((value) => value.includes('.session_token='));
      expect(session).toMatch(/^__Secure-renova-/);
      expect(session).toMatch(/; Secure/i);
      expect(session).toMatch(/; HttpOnly/i);
      expect(session).toMatch(/; SameSite=Lax/i);
      expect(session).not.toMatch(/; Domain=/i);
      const cookieHeader = session?.split(';')[0];
      if (!cookieHeader) throw new Error('Expected a secure session cookie.');
      const proof = production.issueCsrf(cookieHeader);
      expect(proof.cookie).toMatch(/; Secure/i);
      expect(
        production.verifyCsrf(
          new Headers({ cookie: `${cookieHeader}; ${proof.cookie.split(';')[0]}` }),
          proof.token,
        ),
      ).toBe(true);
      expect(
        production.verifyCsrf(
          new Headers({ cookie: proof.cookie.split(';')[0] ?? '' }),
          proof.token,
        ),
      ).toBe(false);
    } finally {
      await production.close();
    }
  });
  it('recusa email acima de 254 caracteres antes de processar autenticacao ou convite', async () => {
    const boundary = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    expect(boundary).toHaveLength(254);
    const snapshot = async () =>
      (
        await inspection.query(`SELECT
          (SELECT count(*)::int FROM public.auth_user) AS users,
          (SELECT count(*)::int FROM public.auth_account) AS accounts,
          (SELECT count(*)::int FROM public.auth_session) AS sessions,
          (SELECT count(*)::int FROM public.auth_verification) AS verifications,
          (SELECT count(*)::int FROM public.auth_rate_limit) AS ip_limits,
          (SELECT count(*)::int FROM public.auth_account_limits) AS account_limits`)
      ).rows[0];
    const before = await snapshot();
    for (const email of [`${boundary}x`, `${'a'.repeat(4096)}@example.test`, ` ${boundary}`]) {
      for (const path of ['sign-in/email', 'request-password-reset']) {
        const response = await post(
          path,
          path === 'sign-in/email' ? { email, password } : { email },
        );
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'Request rejected.' });
        expect(response.headers['set-cookie']).toBeUndefined();
      }
      await expect(auth.invite(email, 'Oversize')).rejects.toThrow(
        'Informe email válido e nome de até 80 caracteres.',
      );
    }
    expect(await snapshot()).toEqual(before);
    expect(messages).toEqual([]);
    expect(events).toEqual([]);
    expect((await post('sign-in/email', { email: boundary, password })).statusCode).toBe(401);
    expect((await post('request-password-reset', { email: boundary })).statusCode).toBe(200);
    const after = await snapshot();
    expect(after.sessions).toBe(before.sessions);
    expect(after.ip_limits).toBe(2);
    expect(after.account_limits).toBe(2);
  });
  it('normaliza email igualmente no convite login recuperacao e limite por conta', async () => {
    const email = 'normalized@example.test';
    await auth.invite(`  ${email.toUpperCase()}  `, 'Normalizado');
    expect(messages[0]?.to).toBe(email);
    expect(
      (await post('reset-password', { token: token(), newPassword: password })).statusCode,
    ).toBe(200);
    const login = await post('sign-in/email', { email: ` ${email.toUpperCase()} `, password });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.email).toBe(email);
    expect(
      (await post('request-password-reset', { email: ` ${email.toUpperCase()} ` })).statusCode,
    ).toBe(200);
    expect(messages.at(-1)?.to).toBe(email);
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await post(
        'sign-in/email',
        { email: attempt % 2 ? email.toUpperCase() : email, password: `${password}Wrong` },
        new Map(),
        `192.0.2.${attempt + 1}`,
      );
      expect(response.statusCode).toBe(attempt < 4 ? 401 : 429);
    }
  });
  it('recusa senha fora do limite e replay concorrente do link', async () => {
    await auth.invite('replay@example.test', 'Replay');
    const value = token();
    for (const newPassword of ['short', 'x'.repeat(129)])
      expect((await post('reset-password', { token: value, newPassword })).statusCode).toBe(400);
    const results = await Promise.all([
      post('reset-password', { token: value, newPassword: password }),
      post('reset-password', { token: value, newPassword: `${password}B` }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect((await post('reset-password', { token: value, newPassword: password })).statusCode).toBe(
      400,
    );
  });
  it('expira link em quinze minutos e armazena identificador sem token bruto', async () => {
    await auth.invite('expired@example.test', 'Expirado');
    const value = token();
    const rows = await inspection.query(
      'SELECT v.* FROM public.auth_verification v JOIN public.auth_user u ON u.id=v.value WHERE u.email=$1',
      ['expired@example.test'],
    );
    expect(rows.rows).toHaveLength(1);
    const verification = rows.rows[0];
    expect(verification.identifier).not.toContain(value);
    expect(verification.expiresAt.getTime() - verification.createdAt.getTime()).toBeGreaterThan(
      899000,
    );
    expect(verification.expiresAt.getTime() - verification.createdAt.getTime()).toBeLessThanOrEqual(
      900000,
    );
    await inspection.query(
      'UPDATE public.auth_verification SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 second\' WHERE id=$1',
      [verification.id],
    );
    expect((await post('reset-password', { token: value, newPassword: password })).statusCode).toBe(
      400,
    );
  });
  it('recusa opcoes nao oferecidas sem permitir sessao de vinte e quatro horas', async () => {
    const email = 'session-options@example.test';
    await auth.invite(email, 'Contrato fechado');
    const activationToken = token();
    expect(
      (
        await post('reset-password', {
          token: activationToken,
          newPassword: password,
          rememberMe: false,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post('reset-password', { token: activationToken, newPassword: password })).statusCode,
    ).toBe(200);
    for (const extra of [
      { rememberMe: false },
      { rememberMe: true },
      { callbackURL: `${origin}/minha-area` },
    ]) {
      expect((await post('sign-in/email', { email, password, ...extra })).statusCode).toBe(400);
    }
    expect((await post('sign-in/email?rememberMe=false', { email, password })).statusCode).toBe(
      400,
    );
    const before = await inspection.query(
      'SELECT count(*)::int AS count FROM public.auth_session s JOIN public.auth_user u ON u.id=s."userId" WHERE u.email=$1',
      [email],
    );
    expect(before.rows[0].count).toBe(0);
    const jar = new Map<string, string>();
    expect((await post('sign-in/email', { email, password }, jar)).statusCode).toBe(200);
    const sessions = await inspection.query(
      'SELECT s."expiresAt", s."createdAt" FROM public.auth_session s JOIN public.auth_user u ON u.id=s."userId" WHERE u.email=$1',
      [email],
    );
    expect(sessions.rows).toHaveLength(1);
    const ttl = sessions.rows[0].expiresAt.getTime() - sessions.rows[0].createdAt.getTime();
    expect(ttl).toBeGreaterThan(28799000);
    expect(ttl).toBeLessThanOrEqual(28800000);
    const mailCount = messages.length;
    expect((await post('request-password-reset', { email, callbackURL: origin })).statusCode).toBe(
      400,
    );
    expect(messages).toHaveLength(mailCount);
    expect(
      (await post('request-password-reset', { email, redirectTo: `${origin}/redefinir-senha` }))
        .statusCode,
    ).toBe(200);
    expect(messages).toHaveLength(mailCount + 1);
    expect(
      (
        await app.inject({
          url: '/api/auth/get-session?disableSessionRefresh=false',
          headers: { cookie: cookie(jar) },
        })
      ).statusCode,
    ).toBe(400);
    expect((await post('sign-out', { token: 'SENTINEL_OPTION' }, jar)).statusCode).toBe(400);
    expect(
      (await app.inject({ url: '/api/auth/get-session', headers: { cookie: cookie(jar) } })).json()
        .user.email,
    ).toBe(email);
    expect((await post('sign-out', {}, jar)).statusCode).toBe(200);
  });
  it('sessao tem oito horas absolutas e expiracao rejeita a proxima requisicao', async () => {
    const jar = await activate('session@example.test');
    const row = (
      await inspection.query(
        'SELECT s.* FROM public.auth_session s JOIN public.auth_user u ON u.id=s."userId" WHERE u.email=$1',
        ['session@example.test'],
      )
    ).rows[0];
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(28799000);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(28800000);
    await inspection.query(
      'UPDATE public.auth_session SET "updatedAt"=CURRENT_TIMESTAMP - interval \'2 days\' WHERE token=$1',
      [row.token],
    );
    expect(
      (await app.inject({ url: '/api/auth/get-session', headers: { cookie: cookie(jar) } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await inspection.query('SELECT "expiresAt" FROM public.auth_session WHERE token=$1', [
          row.token,
        ])
      ).rows[0].expiresAt,
    ).toEqual(row.expiresAt);
    await inspection.query(
      'UPDATE public.auth_session SET "expiresAt"=CURRENT_TIMESTAMP - interval \'1 second\' WHERE token=$1',
      [row.token],
    );
    expect(
      (await app.inject({ url: '/api/trpc/records.list', headers: { cookie: cookie(jar) } }))
        .statusCode,
    ).toBe(401);
  });
  it('recuperacao e falha de envio mantem resposta generica e revogam sessoes antigas', async () => {
    const jar = await activate('recover@example.test');
    const yes = await post('request-password-reset', { email: 'recover@example.test' });
    const value = token();
    const no = await post('request-password-reset', { email: 'unknown@example.test' });
    deliveryFails = true;
    const failed = await post('request-password-reset', { email: 'recover@example.test' });
    expect(yes.json()).toEqual(no.json());
    expect(failed.json()).toEqual(no.json());
    expect(events).toContain('email_failed');
    expect(await auth.invite('undelivered@example.test', 'Pending delivery')).toEqual({
      delivery: 'failed',
    });
    expect(failed.body).not.toContain('SENTINEL');
    expect(
      (await post('reset-password', { token: value, newPassword: `${password}B` })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: '/api/trpc/records.list', headers: { cookie: cookie(jar) } }))
        .statusCode,
    ).toBe(401);
  });
  it('bloqueia origem e CSRF invalidos antes de mudar senha ou sessao', async () => {
    await auth.invite('csrf@example.test', 'CSRF');
    const value = token();
    for (const headers of [
      { origin: 'https://evil.example' },
      { cookie: 'fake=SENTINEL', origin },
      { cookie: 'fake=SENTINEL', origin, 'x-csrf-token': 'forged' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/auth/reset-password',
            payload: { token: value, newPassword: password },
            headers,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect((await post('reset-password', { token: value, newPassword: password })).statusCode).toBe(
      200,
    );
    const jar = new Map<string, string>();
    const anonymousProof = await app.inject('/api/auth/csrf');
    absorb(jar, anonymousProof.headers);
    const stale = anonymousProof.json().token;
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'csrf@example.test', password },
      headers: { cookie: cookie(jar), origin, 'x-csrf-token': stale },
    });
    expect(login.statusCode).toBe(200);
    absorb(jar, login.headers);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/sign-out',
          payload: {},
          headers: { cookie: cookie(jar), origin, 'x-csrf-token': stale },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/auth/get-session', headers: { cookie: cookie(jar) } })).json()
        .user.email,
    ).toBe('csrf@example.test');
  });
  it('limita conta independente do IP e persiste entre instancias', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        post(
          'sign-in/email',
          { email: 'limited@example.test', password },
          new Map(),
          `192.0.2.${index + 1}`,
        ),
      ),
    );
    expect(responses.filter((r) => r.statusCode === 401)).toHaveLength(5);
    expect(responses.filter((r) => r.statusCode === 429)).toHaveLength(3);
    const second = createAuthService(settings);
    try {
      const response = await second.handle(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'limited@example.test', password }),
        }),
        '198.51.100.20',
      );
      expect(response.status).toBe(429);
      expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await second.close();
    }
  });
  it('limita IP mesmo variando conta e rejeita forwarding controlado pelo cliente', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        post(
          'sign-in/email',
          { email: `ip-${index}@example.test`, password },
          new Map(),
          '198.51.100.12',
        ),
      ),
    );
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(5);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(3);
    const second = createAuthService(settings);
    try {
      const response = await second.handle(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-renova-client-ip': '192.0.2.199',
            'x-forwarded-for': '192.0.2.198',
          },
          body: JSON.stringify({ email: 'new-ip-account@example.test', password }),
        }),
        '198.51.100.12',
      );
      expect(response.status).toBe(429);
      expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await second.close();
    }
  });
});
