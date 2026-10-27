import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Screen tests (*.test.tsx) render React components with the same automatic JSX runtime as the app.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    passWithNoTests: false,
    // Same clock zone on every machine as in CI, so date-dependent tests (e.g. the offline AI snapshot) are stable.
    env: { TZ: 'UTC' },
  },
});
