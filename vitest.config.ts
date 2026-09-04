import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { spellAssetAliases, spellRawAssetAliases } from './scripts/spellAssetAliases.mjs'

export default defineConfig({
  resolve: { alias: {
    ...spellAssetAliases,
    ...spellRawAssetAliases,
    'monaco-editor': fileURLToPath(new URL('./tests/unit/monacoEditorStub.ts', import.meta.url)),
  } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
})
