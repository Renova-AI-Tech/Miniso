import type { FastifyInstance, FastifyRequest } from 'fastify';

export type AccessPolicy = 'public' | 'authenticated';

declare module 'fastify' {
  interface FastifyContextConfig {
    accessPolicy?: AccessPolicy;
  }
}

export interface SecurityOptions {
  origin: string;
  verifyCsrf?: (request: FastifyRequest, token: string) => Promise<boolean>;
}

export function registerSecurity(app: FastifyInstance, options: SecurityOptions) {
  app.addHook('onRoute', (route) => {
    if (route.config?.accessPolicy !== 'public') {
      throw new Error('Every route must declare a supported access policy. Auth is not installed.');
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== options.origin) {
      return reply.code(403).send({ error: 'Forbidden.', requestId: request.id });
    }
    if (!request.headers.cookie) return;
    const token = request.headers['x-csrf-token'];
    const valid =
      origin === options.origin &&
      typeof token === 'string' &&
      token.length > 0 &&
      ((await options.verifyCsrf?.(request, token)) ?? false);
    if (!valid) {
      return reply.code(403).send({ error: 'Forbidden.', requestId: request.id });
    }
  });
}
