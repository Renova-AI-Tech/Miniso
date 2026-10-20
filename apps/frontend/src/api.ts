import type { AppRouter } from '@renova/backend/contract';
import { createTRPCClient, httpLink } from '@trpc/client';

export function createApiClient(url = '/api/trpc') {
  return createTRPCClient<AppRouter>({ links: [httpLink({ url })] });
}

export const api = createApiClient();
