import { isIP } from 'node:net';
import { z } from 'zod';

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const insecureCredentials = new Set(['postgres', 'password', 'changeme', 'change-me', 'example']);

function parseDatabaseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) return undefined;
    if (!url.hostname || !url.username || !url.password || url.pathname.length < 2)
      return undefined;
    if (url.search || url.hash || url.hostname.includes('*')) return undefined;
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return url;
  } catch {
    return undefined;
  }
}

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEPLOY_TARGET: z.enum(['local', 'railway']).default('local'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(43124),
    FRONTEND_URL: z.url().default('http://127.0.0.1:43123'),
    DATABASE_URL: z.string().refine((value) => parseDatabaseUrl(value) !== undefined),
    PROFILE: z.literal('authenticated').default('authenticated'),
    AUTH_SECRET: z.string().regex(/^[a-f0-9]{64}$/),
    SMTP_HOST: z.literal('127.0.0.1').optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    MAILPIT_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    AUTH_EMAIL_FROM: z.email(),
    RESEND_API_KEY: z
      .string()
      .regex(/^re_[A-Za-z0-9_-]{10,}$/)
      .optional(),
    RAILWAY_PROJECT_ID: z.uuid().optional(),
    RAILWAY_ENVIRONMENT_ID: z.uuid().optional(),
    RAILWAY_SERVICE_ID: z.uuid().optional(),
    RENOVA_DB_NAME: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,62}$/)
      .optional(),
    RENOVA_DB_PROJECT_ID: z.uuid().optional(),
    RENOVA_DB_ENVIRONMENT_ID: z.uuid().optional(),
  })
  .superRefine((value, ctx) => {
    let frontend: URL;
    try {
      frontend = new URL(value.FRONTEND_URL);
    } catch {
      return;
    }
    if (
      frontend.username ||
      frontend.password ||
      frontend.hostname.includes('*') ||
      frontend.search ||
      frontend.hash ||
      frontend.pathname !== '/' ||
      !['http:', 'https:'].includes(frontend.protocol)
    ) {
      ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'Use a canonical origin.' });
    }
    if (value.NODE_ENV !== 'production' && !loopbackHosts.has(value.HOST)) {
      ctx.addIssue({ code: 'custom', path: ['HOST'], message: 'Use loopback locally.' });
    }
    if (value.NODE_ENV !== 'production' && !loopbackHosts.has(frontend.hostname)) {
      ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'Use loopback locally.' });
    }
    if (value.NODE_ENV !== 'production') {
      if (value.DEPLOY_TARGET !== 'local')
        ctx.addIssue({ code: 'custom', path: ['DEPLOY_TARGET'], message: 'Use local target.' });
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'MAILPIT_PORT'] as const) {
        if (!value[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Configure local email.' });
      }
      if (value.RESEND_API_KEY)
        ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Use local email.' });
    }
    if (value.NODE_ENV === 'production') {
      if (value.DEPLOY_TARGET !== 'railway')
        ctx.addIssue({ code: 'custom', path: ['DEPLOY_TARGET'], message: 'Use Railway target.' });
      for (const key of [
        'RESEND_API_KEY',
        'RAILWAY_PROJECT_ID',
        'RAILWAY_ENVIRONMENT_ID',
        'RAILWAY_SERVICE_ID',
        'RENOVA_DB_NAME',
      ] as const) {
        if (!value[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Configure production runtime.' });
      }
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'MAILPIT_PORT'] as const) {
        if (value[key] !== undefined)
          ctx.addIssue({ code: 'custom', path: [key], message: 'Local email is not production.' });
      }
      if (/^([a-f0-9])\1+$/.test(value.AUTH_SECRET))
        ctx.addIssue({ code: 'custom', path: ['AUTH_SECRET'], message: 'Use a unique secret.' });
      if (/@[^@]*\.(local|test|invalid)$/i.test(value.AUTH_EMAIL_FROM))
        ctx.addIssue({
          code: 'custom',
          path: ['AUTH_EMAIL_FROM'],
          message: 'Use a verified sender.',
        });
      for (const [stored, current] of [
        ['RENOVA_DB_PROJECT_ID', 'RAILWAY_PROJECT_ID'],
        ['RENOVA_DB_ENVIRONMENT_ID', 'RAILWAY_ENVIRONMENT_ID'],
      ] as const) {
        if (value[stored] !== undefined && value[stored] !== value[current])
          ctx.addIssue({
            code: 'custom',
            path: [stored],
            message: 'Deployment identity mismatch.',
          });
      }
      if (
        frontend.protocol !== 'https:' ||
        frontend.hostname.endsWith('.') ||
        isIP(frontend.hostname.replace(/^\[|\]$/g, '')) !== 0 ||
        !frontend.hostname.includes('.') ||
        /\.(localhost|local|internal|test|invalid)$/i.test(frontend.hostname)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['FRONTEND_URL'],
          message: 'Use a public HTTPS origin.',
        });
      }
      const database = parseDatabaseUrl(value.DATABASE_URL);
      if (
        database &&
        (decodeURIComponent(database.username) !== 'renova_runtime' ||
          !database.hostname.endsWith('.railway.internal') ||
          database.pathname !== `/${value.RENOVA_DB_NAME}` ||
          insecureCredentials.has(decodeURIComponent(database.password).toLowerCase()) ||
          decodeURIComponent(database.password).length < 24)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_URL'],
          message: 'Use runtime credentials.',
        });
      }
    }
  });

export type BackendEnv = Readonly<z.infer<typeof schema>>;

export function parseEnv(source: Readonly<Record<string, string | undefined>>): BackendEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].join(', ');
    throw new Error(`Invalid backend configuration: ${fields}.`);
  }
  return Object.freeze(parsed.data);
}

export function readEnv(): BackendEnv {
  return parseEnv(process.env);
}
