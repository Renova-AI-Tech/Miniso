import type { Identity } from '@renova/auth';
import type { RecordsRepository } from '../modules/records/records.repository.js';
import { initTRPC, TRPCError } from '@trpc/server';
import type { AnyProcedure, AnyRouter } from '@trpc/server';
import type { AccessPolicy } from './security.js';
import type { ExampleRepository } from '../modules/example/example.repository.js';

export interface TrpcContext {
  requestId: string;
  identity?: Identity | null | undefined;
  records?: RecordsRepository | undefined;
  examples?: ExampleRepository | undefined;
}

const t = initTRPC
  .context<TrpcContext>()
  .meta<{ accessPolicy: AccessPolicy }>()
  .create({
    errorFormatter({ shape, ctx }) {
      return {
        code: shape.code,
        message: shape.data.httpStatus >= 500 ? 'Internal server error.' : 'Request rejected.',
        data: {
          code: shape.data.code,
          httpStatus: shape.data.httpStatus,
          requestId: ctx?.requestId ?? 'unavailable',
        },
      };
    },
  });

export const router = t.router;
export const publicProcedure = t.procedure.meta({ accessPolicy: 'public' });

export const authenticatedProcedure = t.procedure
  .meta({ accessPolicy: 'authenticated' })
  .use(({ ctx, next }) => {
    if (!ctx.identity) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (!ctx.records) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    return next({ ctx: { ...ctx, identity: ctx.identity, records: ctx.records } });
  });

export function assertRouterPolicies(appRouter: AnyRouter, authInstalled = false) {
  for (const procedure of Object.values(appRouter._def.procedures)) {
    const meta = (procedure as AnyProcedure)._def.meta as { accessPolicy?: unknown } | undefined;
    if (
      meta?.accessPolicy !== 'public' &&
      !(authInstalled && meta?.accessPolicy === 'authenticated')
    ) {
      throw new Error(
        'Every procedure must declare a supported access policy. Auth is not installed.',
      );
    }
  }
}
