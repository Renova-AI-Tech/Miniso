import { fastifyRequestHandler } from '@trpc/server/adapters/fastify';
import type { AnyRouter } from '@trpc/server';
import type { FastifyInstance } from 'fastify';
import { appRouter } from './app-router.js';
import { assertRouterPolicies } from './trpc.js';
import type { ExampleRepository } from '../modules/example/example.repository.js';

export async function registerTrpc(
  app: FastifyInstance,
  selectedRouter: AnyRouter = appRouter,
  examples?: ExampleRepository,
) {
  assertRouterPolicies(selectedRouter);
  await app.register(async (transport) => {
    transport.removeContentTypeParser('application/json');
    transport.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_request, body, done) => {
        done(null, body);
      },
    );
    transport.route<{ Params: { path: string } }>({
      method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      url: '/api/trpc/:path',
      config: { accessPolicy: 'public' },
      handler: async (request, reply) => {
        await fastifyRequestHandler({
          req: request,
          res: reply,
          path: request.params.path,
          router: selectedRouter,
          allowBatching: false,
          allowMethodOverride: false,
          createContext: () => ({ requestId: request.id, examples }),
          onError: ({ error }) => {
            request.log.warn({
              event: 'procedure_failed',
              code: error.code,
              requestId: request.id,
            });
          },
        });
      },
    });
  });
}
