import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { createMailTransport, type AuthMail, type MailSettings } from './mail.js';

export type { AuthMail } from './mail.js';

export interface AuthSettings extends MailSettings {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  FRONTEND_URL: string;
  AUTH_SECRET: string;
}
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}
export interface Identity {
  user: AuthUser;
  session: { expiresAt: Date };
}
export type AuthEvent = 'email_accepted' | 'email_failed' | 'auth_failed';
export interface AuthOptions {
  sendMail?: (message: AuthMail) => Promise<void>;
  onEvent?: (event: AuthEvent) => void;
}
export function reportAuthEvent(event: AuthEvent) {
  process.stdout.write(`${JSON.stringify({ event })}\n`);
}
const allowedPaths = new Set([
  'sign-in/email',
  'sign-out',
  'get-session',
  'request-password-reset',
  'reset-password',
]);
const bodyFields: Readonly<Record<string, readonly string[]>> = {
  'sign-in/email': ['email', 'password'],
  'sign-out': [],
  'request-password-reset': ['email', 'redirectTo'],
  'reset-password': ['token', 'newPassword'],
};
function validBody(path: string, body: unknown): body is Record<string, string> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const fields = bodyFields[path];
  if (!fields) return false;
  const values = body as Record<string, unknown>;
  return (
    Object.keys(values).every((key) => fields.includes(key) && typeof values[key] === 'string') &&
    fields.every((key) => key === 'redirectTo' || typeof values[key] === 'string')
  );
}
function normalizeEmail(value: string): string | null {
  // Bound the submitted value before normalization, including discarded whitespace.
  if (value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
const genericReset = {
  status: true,
  message: 'Se houver uma conta liberada, você receberá as instruções de acesso.',
};
function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function readCookie(header: string | null, name: string) {
  return (
    header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}
function safeUser(user: AuthUser): AuthUser {
  return { id: user.id, name: user.name, email: user.email };
}

/** Better Auth mantém senha, sessão e tokens. A aplicação mantém suas políticas. */
export function createAuthService(settings: AuthSettings, options: AuthOptions = {}) {
  const origin = new URL(settings.FRONTEND_URL).origin;
  const prefix = `renova-${createHash('sha256').update(settings.AUTH_SECRET).digest('hex').slice(0, 12)}`;
  const csrfName = `${prefix}.csrf`;
  const sessionName = `${settings.NODE_ENV === 'production' ? '__Secure-' : ''}${prefix}.session_token`;
  const pool = new pg.Pool({
    connectionString: settings.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: 'renova-auth',
  });
  pool.on('error', () => options.onEvent?.('auth_failed'));
  const database = new Kysely({ dialect: new PostgresDialect({ pool }) });
  const mail = createMailTransport(settings);
  const send = options.sendMail ?? mail.send;
  const deliveryContext = new AsyncLocalStorage<{ delivery: 'accepted' | 'failed' }>();
  const hmac = (text: string) =>
    createHmac('sha256', settings.AUTH_SECRET).update(text).digest('hex');
  const auth = betterAuth({
    appName: 'Renova',
    baseURL: origin,
    basePath: '/api/auth',
    secret: settings.AUTH_SECRET,
    database: { db: database, type: 'postgres', transaction: true },
    trustedOrigins: [origin],
    logger: { disabled: true },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: prefix,
      useSecureCookies: settings.NODE_ENV === 'production',
      ipAddress: { ipAddressHeaders: ['x-renova-client-ip'] },
    },
    user: { modelName: 'auth_user' },
    account: { modelName: 'auth_account' },
    verification: { modelName: 'auth_verification', storeIdentifier: 'hashed' },
    session: {
      modelName: 'auth_session',
      expiresIn: 28800,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
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
        const page = user.emailVerified ? '/redefinir-senha' : '/ativar';
        const url = new URL(page, origin);
        url.searchParams.set('token', token);
        try {
          await send({
            to: user.email,
            subject: user.emailVerified ? 'Recuperar acesso' : 'Ativar seu acesso',
            text: `Use este link em até 15 minutos para definir sua senha: ${url.href}\nSe você não solicitou, ignore esta mensagem.`,
          });
          const delivery = deliveryContext.getStore();
          if (delivery) delivery.delivery = 'accepted';
          options.onEvent?.('email_accepted');
        } catch {
          options.onEvent?.('email_failed');
        }
      },
      onPasswordReset: async ({ user }) => {
        await (await auth.$context).internalAdapter.updateUser(user.id, { emailVerified: true });
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'auth_rate_limit',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 900, max: 5 },
        '/request-password-reset': { window: 900, max: 5 },
        '/reset-password': { window: 900, max: 20 },
      },
    },
  });

  async function accountLimit(email: string, operation: string) {
    const key = hmac(`${operation}:${email.trim().toLowerCase()}`);
    await pool.query(
      "DELETE FROM public.auth_account_limits WHERE window_start < CURRENT_TIMESTAMP - interval '15 minutes'",
    );
    const result = await pool.query<{ count: number; remaining: number }>(
      `
      INSERT INTO public.auth_account_limits (key, count, window_start) VALUES ($1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_account_limits.window_start <= CURRENT_TIMESTAMP - interval '15 minutes' THEN 1 ELSE auth_account_limits.count + 1 END,
        window_start = CASE WHEN auth_account_limits.window_start <= CURRENT_TIMESTAMP - interval '15 minutes' THEN CURRENT_TIMESTAMP ELSE auth_account_limits.window_start END
      WHERE auth_account_limits.window_start <= CURRENT_TIMESTAMP - interval '15 minutes' OR auth_account_limits.count < 5
      RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM window_start + interval '15 minutes' - CURRENT_TIMESTAMP)))::integer AS remaining`,
      [key],
    );
    if (result.rows.length) return null;
    const current = await pool.query<{ remaining: number }>(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM window_start + interval '15 minutes' - CURRENT_TIMESTAMP)))::integer AS remaining FROM public.auth_account_limits WHERE key=$1`,
      [key],
    );
    return current.rows[0]?.remaining ?? 900;
  }
  async function getSession(headers: Headers): Promise<Identity | null> {
    const session = await auth.api.getSession({ headers });
    return session
      ? { user: safeUser(session.user), session: { expiresAt: session.session.expiresAt } }
      : null;
  }
  function issueCsrf(cookie: string | null) {
    const value = `${randomBytes(24).toString('hex')}.${Date.now() + 28800000}`;
    const token = `${value}.${hmac(`${value}.${readCookie(cookie, sessionName)}`)}`;
    return {
      token,
      cookie: `${csrfName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${settings.NODE_ENV === 'production' ? '; Secure' : ''}`,
    };
  }
  function verifyCsrf(headers: Headers, token: string) {
    const stored = readCookie(headers.get('cookie'), csrfName);
    const parts = token.split('.');
    if (
      !stored ||
      !equal(stored, token) ||
      parts.length !== 3 ||
      !/^\d+$/.test(parts[1] ?? '') ||
      Number(parts[1]) < Date.now()
    )
      return false;
    return equal(
      parts[2] ?? '',
      hmac(`${parts[0]}.${parts[1]}.${readCookie(headers.get('cookie'), sessionName)}`),
    );
  }
  async function handle(request: Request, clientIp: string): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice('/api/auth/'.length);
    if (
      !allowedPaths.has(path) ||
      (path === 'get-session' ? request.method !== 'GET' : request.method !== 'POST')
    )
      return Response.json({ error: 'Not found.' }, { status: 404 });
    // This bridge exposes one fixed product contract, not every library option.
    // In particular rememberMe:false creates a 24h library session, outside our 8h policy.
    if (url.search) return Response.json({ error: 'Request rejected.' }, { status: 400 });
    const body: unknown =
      request.method === 'POST'
        ? await request
            .clone()
            .json()
            .catch(() => null)
        : undefined;
    if (request.method === 'POST') {
      if (!validBody(path, body)) {
        return Response.json({ error: 'Request rejected.' }, { status: 400 });
      }
      if (path === 'sign-in/email' || path === 'request-password-reset') {
        const email = normalizeEmail(body.email ?? '');
        if (!email) return Response.json({ error: 'Request rejected.' }, { status: 400 });
        body.email = email;
        const retry = await accountLimit(email, path);
        if (retry)
          return Response.json(
            { error: 'Aguarde antes de tentar novamente.' },
            { status: 429, headers: { 'retry-after': String(retry) } },
          );
      }
    }
    const headers = new Headers(request.headers);
    headers.set('x-renova-client-ip', clientIp);
    // Never trust caller-provided forwarding. Fastify supplies its validated socket/proxy address.
    headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
    if (request.method === 'POST') headers.delete('content-length');
    const guarded = new Request(request, {
      headers,
      ...(request.method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
    let response: Response;
    try {
      response = await auth.handler(guarded);
    } catch {
      options.onEvent?.('auth_failed');
      return Response.json(
        { error: 'Não foi possível concluir. Tente novamente.' },
        { status: 500 },
      );
    }
    const outputHeaders = new Headers(response.headers);
    outputHeaders.delete('content-length');
    outputHeaders.delete('content-encoding');
    const retry = outputHeaders.get('x-retry-after');
    if (retry) outputHeaders.set('retry-after', retry);
    if (!response.ok)
      return Response.json(
        {
          error:
            response.status === 429
              ? 'Aguarde antes de tentar novamente.'
              : 'Não foi possível concluir. Confira os dados ou solicite um novo link.',
        },
        { status: response.status, headers: outputHeaders },
      );
    if (path === 'get-session')
      return Response.json(await getSession(headers), { headers: outputHeaders });
    if (path === 'sign-in/email') {
      const body = (await response.json()) as { user: AuthUser };
      return Response.json({ user: safeUser(body.user) }, { headers: outputHeaders });
    }
    return Response.json(path === 'request-password-reset' ? genericReset : { status: true }, {
      headers: outputHeaders,
    });
  }
  async function invite(email: string, name: string): Promise<{ delivery: 'accepted' | 'failed' }> {
    const normalized = normalizeEmail(email);
    if (!normalized || !name.trim() || name.trim().length > 80)
      throw new Error('Informe email válido e nome de até 80 caracteres.');
    if (await accountLimit(normalized, 'invitation'))
      throw new Error('Aguarde 15 minutos antes de reenviar.');
    const context = await auth.$context;
    let found = await context.internalAdapter.findUserByEmail(normalized);
    if (!found) {
      const user = await context.internalAdapter.createUser(
        { name: name.trim(), email: normalized, emailVerified: false },
        { method: 'email-password' },
      );
      // An unknown random initial password is never displayed or sent. Verification gates every session.
      await context.internalAdapter.createAccount({
        userId: user.id,
        providerId: 'credential',
        accountId: user.id,
        password: await context.password.hash(randomBytes(32).toString('hex')),
      });
      found = { user, accounts: [] };
    }
    if (found.user.emailVerified)
      throw new Error('Conta já ativa. Use Recuperar acesso na tela de entrada.');
    const delivery = { delivery: 'failed' as 'accepted' | 'failed' };
    await deliveryContext.run(delivery, () =>
      auth.api.requestPasswordReset({ body: { email: normalized } }),
    );
    return delivery;
  }
  return {
    handle,
    getSession,
    issueCsrf,
    verifyCsrf,
    invite,
    close: async () => {
      mail.close();
      try {
        // Better Auth starts schema introspection during initialization. Its shared
        // check promise must settle before Kysely destroys the pool it is acquiring.
        const context = await auth.$context;
        await context.checkSchema?.();
      } catch {
        // Initialization failure still requires releasing every local resource.
      } finally {
        await database.destroy();
        if (!pool.ending) await pool.end();
      }
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
