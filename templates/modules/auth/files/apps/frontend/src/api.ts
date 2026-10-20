import type { AppRouter } from '@renova/backend/contract';
import { createTRPCClient, httpLink } from '@trpc/client';
import { csrfToken } from './auth/client';

export function createApiClient(url = '/api/trpc') {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url,
        async headers({ op }) {
          return op.type === 'mutation' ? { 'x-csrf-token': await csrfToken() } : {};
        },
        fetch(url, options) {
          return fetch(url, {
            ...options,
            signal: options?.signal ?? null,
            credentials: 'same-origin',
          });
        },
      }),
    ],
  });
}

export const api = createApiClient();
