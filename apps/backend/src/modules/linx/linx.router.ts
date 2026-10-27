import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../../server/trpc.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato YYYY-MM-DD.');
const companies = z.array(z.string().min(1).max(32)).max(100).default([]);
const period = z.object({ start: day, end: day, companies }).strict();
const syncInput = z
  .object({
    daysBack: z.number().int().min(1).max(31).default(3),
    profile: z.enum(['dashboard', 'full']).default('dashboard'),
  })
  .strict();

export const linxRouter = router({
  health: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    return await ctx.linx.getHealth();
  }),
  sync: publicProcedure.input(syncInput).mutation(async ({ ctx, input }) => {
    if (!ctx.sync) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    try {
      return await ctx.sync.start(input);
    } catch (error) {
      if (error instanceof Error && error.message.includes('já está em execução')) {
        throw new TRPCError({ code: 'CONFLICT', message: error.message });
      }
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Coleta Linx indisponível.' });
    }
  }),
  stores: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    return { data: await ctx.linx.listStores() };
  }),
  summary: publicProcedure.input(period).query(async ({ ctx, input }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    const data = await ctx.linx.getSummary(input.start, input.end, input.companies);
    return {
      start: input.start,
      end: input.end,
      source: data.source,
      data,
    };
  }),
  dashboard: publicProcedure.input(period).query(async ({ ctx, input }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    return {
      start: input.start,
      end: input.end,
      ...(await ctx.linx.getDashboard(input.start, input.end, input.companies)),
    };
  }),
  dailySales: publicProcedure
    .input(
      period.extend({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(10000).default(100),
        productCode: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return { start: input.start, end: input.end, ...(await ctx.linx.getDailySales(input)) };
    }),
  products: publicProcedure
    .input(
      z
        .object({
          search: z.string().max(160).default(''),
          asOf: day,
          companies,
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(10000).default(50),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return await ctx.linx.listProducts(input);
    }),
  inventory: publicProcedure
    .input(
      z
        .object({
          asOf: day,
          companies,
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(10000).default(100),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return await ctx.linx.getInventory(input);
    }),
  inventoryHistory: publicProcedure
    .input(
      z
        .object({
          start: day,
          end: day,
          companies,
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(10000).default(5000),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return await ctx.linx.getInventoryHistory(input);
    }),
  analyses: publicProcedure.input(period).query(async ({ ctx, input }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    return {
      start: input.start,
      end: input.end,
      ...(await ctx.linx.getAnalyses(input.start, input.end, input.companies)),
    };
  }),
  syncStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
    return await ctx.linx.getSyncStatus();
  }),
  syncHistory: publicProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(200).default(25),
          method: z.string().max(120).optional(),
          status: z.string().optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return await ctx.linx.getSyncHistory(input);
    }),
  syncAudit: publicProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(200).default(50),
          runId: z.number().int().positive().optional(),
          tableName: z.string().max(160).optional(),
          changeType: z.string().max(40).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.linx) throw new TRPCError({ code: 'SERVICE_UNAVAILABLE' });
      return await ctx.linx.getSyncAudit(input);
    }),
});
