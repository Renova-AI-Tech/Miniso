import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../../server/trpc.js';

const listInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(12),
    cursor: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .strict()
  .default({ limit: 12 });

export const exampleRouter = router({
  list: publicProcedure.input(listInput).query(async ({ ctx, input }) => {
    if (!ctx.examples) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    try {
      return await ctx.examples.list(input);
    } catch {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    }
  }),
});
