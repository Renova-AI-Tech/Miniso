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
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(43124),
    FRONTEND_URL: z.url().default('http://127.0.0.1:43123'),
    DATABASE_URL: z.string().refine((value) => parseDatabaseUrl(value) !== undefined),
    PROFILE: z.literal('public').default('public'),
    DEPLOY_TARGET: z.enum(['local', 'railway']).default('local'),
    RAILWAY_PROJECT_ID: z.uuid().optional(),
    RAILWAY_ENVIRONMENT_ID: z.uuid().optional(),
    RAILWAY_SERVICE_ID: z.uuid().optional(),
    RENOVA_DB_NAME: z
      .string()
      .regex(/^[a-z][a-z0-9_]{2,62}$/)
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
    if (value.NODE_ENV === 'production') {
      for (const field of [
        'RAILWAY_PROJECT_ID',
        'RAILWAY_ENVIRONMENT_ID',
        'RAILWAY_SERVICE_ID',
      ] as const) {
        if (!value[field]) {
          ctx.addIssue({ code: 'custom', path: [field], message: 'Identify the Railway target.' });
        }
      }
      if (value.DEPLOY_TARGET !== 'railway') {
        ctx.addIssue({
          code: 'custom',
          path: ['DEPLOY_TARGET'],
          message: 'Use the validated Railway target.',
        });
      }
      const hostname = frontend.hostname.replace(/^\[|\]$/g, '');
      if (
        frontend.protocol !== 'https:' ||
        isIP(hostname) !== 0 ||
        !hostname.includes('.') ||
        hostname.endsWith('.') ||
        /\.(?:localhost|local|internal|test|invalid)$/.test(hostname)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['FRONTEND_URL'],
          message: 'Use a public HTTPS origin.',
        });
      }
      const database = parseDatabaseUrl(value.DATABASE_URL);
      if (
        !value.RENOVA_DB_NAME ||
        (database &&
          (database.hostname.endsWith('.railway.internal') !== true ||
            database.username !== 'renova_runtime' ||
            database.pathname !== `/${value.RENOVA_DB_NAME}`))
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['DATABASE_URL'],
          message: 'Use the bound private runtime database.',
        });
      }
      if (value.RENOVA_DB_PROJECT_ID && value.RENOVA_DB_PROJECT_ID !== value.RAILWAY_PROJECT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['RENOVA_DB_PROJECT_ID'],
          message: 'Database project differs.',
        });
      }
      if (
        value.RENOVA_DB_ENVIRONMENT_ID &&
        value.RENOVA_DB_ENVIRONMENT_ID !== value.RAILWAY_ENVIRONMENT_ID
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['RENOVA_DB_ENVIRONMENT_ID'],
          message: 'Database environment differs.',
        });
      }
      if (
        database &&
        (['postgres', 'root', 'admin'].includes(
          decodeURIComponent(database.username).toLowerCase(),
        ) ||
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
