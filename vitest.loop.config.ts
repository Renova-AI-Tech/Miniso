import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10_000,
    hookTimeout: 10_000,
    retries: 0,
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
