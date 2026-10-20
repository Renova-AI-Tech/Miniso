import { initTRPC } from '@trpc/server';
import type { AnyProcedure, AnyRouter } from '@trpc/server';
import type { AccessPolicy } from './security.js';
import type { LinxRepository } from '../modules/linx/linx.repository.js';

export interface TrpcContext {
  requestId: string;
  linx?: LinxRepository | undefined;
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

export function assertRouterPolicies(appRouter: AnyRouter) {
  for (const procedure of Object.values(appRouter._def.procedures)) {
    const meta = (procedure as AnyProcedure)._def.meta as { accessPolicy?: unknown } | undefined;
    if (meta?.accessPolicy !== 'public') {
      throw new Error(
        'Every procedure must declare a supported access policy. Auth is not installed.',
      );
    }
  }
}
