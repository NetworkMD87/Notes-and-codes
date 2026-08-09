import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/benchmark/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
