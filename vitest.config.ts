import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Fixture server binds a fixed port (test/fixtures/server.ts), so suites that
    // boot it must not race. Threads are fine; the server module refcounts.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
