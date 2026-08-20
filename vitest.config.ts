import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Day 7 wrongly "fixed" a fixed-port EADDRINUSE race between test files
    // (test/fixtures/server.ts) by serialising every file with
    // fileParallelism: false. The fixed port was the actual root cause - an
    // ephemeral port (Day 8, DECISIONS.md D54) removes the collision
    // entirely, so parallelism is restored here.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
