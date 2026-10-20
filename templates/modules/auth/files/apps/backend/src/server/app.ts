import type { AuthService } from '@renova/auth';
import type { RecordsRepository } from '../modules/records/records.repository.js';
import { fromNodeHeaders } from 'better-auth/node';
import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { AnyRouter } from '@trpc/server';
import Fastify, { LogController, type FastifyReply } from 'fastify';
import type { BackendEnv } from '../env.js';
import { clientIp } from './client-ip.js';
import { registerFrontend } from './frontend.js';
import { registerTrpc } from './register.js';
import { registerSecurity, type SecurityOptions } from './security.js';
import type { ExampleRepository } from '../modules/example/example.repository.js';

export interface AppOptions {
  frontendRoot?: string;
  auth?: AuthService;
  records?: RecordsRepository;
  readiness?: () => Promise<boolean>;
  logStream?: { write(message: string): void };
  verifyCsrf?: SecurityOptions['verifyCsrf'];
  router?: AnyRouter;
  examples?: ExampleRepository;
}

export async function createApp(env: BackendEnv, options: AppOptions = {}) {
  const app = Fastify({
    bodyLimit: 1024 * 1024,
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    trustProxy: false,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    frameworkErrors(error, request, reply: FastifyReply) {
      const statusCode = error.code === 'FST_ERR_MAX_PARAM_LENGTH' ? 414 : 400;
      request.log.warn({ event: 'request_rejected', statusCode, requestId: request.id });
      return reply
        .code(statusCode)
        .header('x-request-id', request.id)
        .header('x-content-type-options', 'nosniff')
        .header('referrer-policy', 'no-referrer')
        .header('cache-control', 'no-store')
        .send({ error: 'Request rejected.', requestId: request.id });
    },
    logController: new LogController({ disableRequestLogging: true }),
    logger: {
      level: 'info',
      ...(options.logStream ? { stream: options.logStream } : {}),
      serializers: {
        req: (request) => ({ method: request.method }),
        res: (response) => ({ statusCode: response.statusCode }),
        err: () => ({ type: 'Error', message: 'Request failed.', stack: '' }),
      },
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cache-control', 'no-store');
  });
  const authService = options.auth;
  registerSecurity(app, {
    origin: new URL(env.FRONTEND_URL).origin,
    ...(authService
      ? {
          authenticate: async (request) =>
            Boolean(await authService.getSession(fromNodeHeaders(request.headers))),
          verifyCsrf: async (request, token) =>
            authService.verifyCsrf(fromNodeHeaders(request.headers), token),
        }
      : {}),
    ...(options.verifyCsrf ? { verifyCsrf: options.verifyCsrf } : {}),
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: 60_000,
    cache: 5000,
    keyGenerator: (request) => clientIp(env, request),
  });

  app.setErrorHandler((error, request, reply) => {
    const candidate = error instanceof Error && 'statusCode' in error ? error.statusCode : 500;
    const statusCode =
      typeof candidate === 'number' && candidate >= 400 && candidate < 500 ? candidate : 500;
    request.log.warn({ event: 'request_failed', statusCode, requestId: request.id });
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error.' : 'Request rejected.',
      requestId: request.id,
    });
  });
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) => {
    reply
      .header('cache-control', 'no-store')
      .code(404)
      .send({ error: 'Not found.', requestId: request.id });
  });

  app.get('/health', { config: { accessPolicy: 'public' } }, async () => ({
    status: 'ok' as const,
  }));
  app.get('/ready', { config: { accessPolicy: 'public' } }, async (request, reply) => {
    let ready = false;
    try {
      ready = (await options.readiness?.()) ?? false;
    } catch {
      request.log.warn({ event: 'readiness_failed', requestId: request.id });
    }
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });

  if (options.auth) {
    const auth = options.auth;
    app.get('/api/auth/csrf', { config: { accessPolicy: 'public' } }, async (request, reply) => {
      const proof = auth.issueCsrf(request.headers.cookie ?? null);
      reply.header('set-cookie', proof.cookie);
      return { token: proof.token };
    });
    app.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      config: { accessPolicy: 'public' },
      async handler(request, reply) {
        const response = await auth.handle(
          new Request(new URL(request.url, env.FRONTEND_URL), {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
          }),
          clientIp(env, request),
        );
        reply.code(response.status);
        for (const [key, value] of response.headers)
          if (key !== 'set-cookie') reply.header(key, value);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) reply.header('set-cookie', cookies);
        return reply.send(await response.text());
      },
    });
  }
  try {
    await registerTrpc(app, options.router, options.examples, options.auth, options.records);
    if (env.NODE_ENV === 'production') await registerFrontend(app, options.frontendRoot);
  } catch (error) {
    await app.close();
    throw error;
  }

  return app;
}
