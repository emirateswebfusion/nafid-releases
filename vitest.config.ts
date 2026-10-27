import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: false,
    // Same clock zone on every machine as in CI, so date-dependent tests (e.g. the offline AI snapshot) are stable.
    env: { TZ: 'UTC' },
  },
});
