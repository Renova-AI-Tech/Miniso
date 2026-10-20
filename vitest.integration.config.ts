import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 30_000,
    retries: 0,
    include: ['tests/integration/**/*.test.ts'],
    reporters: ['verbose'],
    fileParallelism: false,
  },
});
