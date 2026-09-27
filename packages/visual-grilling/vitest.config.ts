import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

// CLI, browser and corpus tests each spawn a real server process (via the
// built CLI) and/or a Chromium instance per test file. Vitest's own default
// is to run as many files in parallel as there are CPUs; with 29 files that
// can mean a dozen servers and browsers starting at once, which starves the
// machine. Under that load the CLI's own 10 s server-start budget (see
// SERVER_START_MS in src/cli/main.ts) and the harness's own timeouts stop
// being met, and `npm test` gets flaky in a way that has nothing to do with
// the product. Capping how many files run at once keeps the default `npm
// test` reliable without loosening any product-level timing budget.
const maxWorkers = Math.max(2, Math.floor(cpus().length / 3));

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // CLI and browser tests spawn servers and a browser; keep them roomy.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers,
  },
});
