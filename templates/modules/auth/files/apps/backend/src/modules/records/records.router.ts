import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authenticatedProcedure, router } from '../../server/trpc.js';
const title = z.string().trim().min(1).max(120);
export const recordsRouter = router({
  list: authenticatedProcedure
    .input(
      z
        .strictObject({
          limit: z.number().int().min(1).max(100).default(100),
          cursor: z.uuid().optional(),
        })
        .default({ limit: 100 }),
    )
    .query(({ ctx, input }) => ctx.records.list(ctx.identity.user.id, input)),
  create: authenticatedProcedure
    .input(z.strictObject({ title }))
    .mutation(({ ctx, input }) => ctx.records.create(ctx.identity.user.id, input.title)),
  update: authenticatedProcedure
    .input(z.strictObject({ id: z.uuid(), title }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.records.update(ctx.identity.user.id, input.id, input.title);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return row;
    }),
});
