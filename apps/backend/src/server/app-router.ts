import { publicProcedure, router } from './trpc.js';
import { exampleRouter } from '../modules/example/example.router.js';

export const appRouter = router({
  system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
  public: exampleRouter,
});

export type AppRouter = typeof appRouter;
