import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CLI and browser tests spawn servers and a browser; keep them roomy.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
