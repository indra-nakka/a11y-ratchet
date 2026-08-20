import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Fixture server binds a fixed port (test/fixtures/server.ts). Its
    // refcounting only works WITHIN one file's module instance - Vitest gives
    // each test file its own isolated module registry even inside a shared
    // worker thread, so two files' start() calls race for the same port if
    // they run concurrently. Corrected from an earlier, wrong assumption
    // ("threads are fine") once a third server-dependent file (Day 7's
    // crawler tests) made the race show up reliably instead of by luck.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
