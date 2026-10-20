import {
  createApp as createConfiguredApp,
  type AppOptions,
} from '../../apps/backend/src/server/app.js';
import type { BackendEnv } from '../../apps/backend/src/env.js';
import { publicProcedure, router } from '../../apps/backend/src/server/trpc.js';

// HTTP-only fixtures have no identity database. Explicitly choose a public router;
// the real application retains its protected router and refuses a missing adapter.
const transportRouter = router({
  system: router({ health: publicProcedure.query(() => ({ status: 'ok' as const })) }),
});

export function createApp(env: BackendEnv, options: AppOptions = {}) {
  return createConfiguredApp(env, { router: transportRouter, ...options });
}

export type { AppOptions };
