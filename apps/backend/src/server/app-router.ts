import { publicProcedure, router } from './trpc.js';
import { linxRouter } from '../modules/linx/linx.router.js';

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
  linx: linxRouter,
});

export type AppRouter = typeof appRouter;
