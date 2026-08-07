import { defineConfig } from 'vitest/config'
import { spellAssetAliases, spellRawAssetAliases } from './scripts/spellAssetAliases.mjs'

export default defineConfig({
  resolve: { alias: { ...spellAssetAliases, ...spellRawAssetAliases } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
})
