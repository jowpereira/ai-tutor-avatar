import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      lines: 70,
      functions: 60,
      branches: 60,
      statements: 70,
      reportsDirectory: 'coverage',
    },
    globals: true,
  },
});
