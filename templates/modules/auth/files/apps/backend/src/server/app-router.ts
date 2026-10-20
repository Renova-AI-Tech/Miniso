import { recordsRouter } from '../modules/records/records.router.js';
import { publicProcedure, router } from './trpc.js';
import { exampleRouter } from '../modules/example/example.router.js';

export const appRouter = router({
  records: recordsRouter,
  system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
  public: exampleRouter,
});

export type AppRouter = typeof appRouter;
