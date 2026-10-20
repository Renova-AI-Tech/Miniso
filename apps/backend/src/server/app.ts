import { randomUUID } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import type { AnyRouter } from '@trpc/server';
import Fastify, { LogController, type FastifyReply } from 'fastify';
import type { BackendEnv } from '../env.js';
import { clientIp } from './client-ip.js';
import { registerFrontend } from './frontend.js';
import { registerTrpc } from './register.js';
import { registerSecurity, type SecurityOptions } from './security.js';
import type { LinxRepository } from '../modules/linx/linx.repository.js';

export interface AppOptions {
  frontendRoot?: string;
  readiness?: () => Promise<boolean>;
  logStream?: { write(message: string): void };
  verifyCsrf?: SecurityOptions['verifyCsrf'];
  router?: AnyRouter;
  linx?: LinxRepository;
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
  registerSecurity(app, {
    origin: new URL(env.FRONTEND_URL).origin,
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

  try {
    await registerTrpc(app, options.router, options.linx);
    if (env.NODE_ENV === 'production') await registerFrontend(app, options.frontendRoot);
  } catch (error) {
    await app.close();
    throw error;
  }

  return app;
}
