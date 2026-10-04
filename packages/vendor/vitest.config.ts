import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Each test builds git repos and runs the CLI as a process.
    testTimeout: 30_000,
  },
});
