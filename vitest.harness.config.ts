import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    retries: 0,
    include: ['scripts/harness/**/*.test.mjs'],
    reporters: ['verbose'],
  },
});
