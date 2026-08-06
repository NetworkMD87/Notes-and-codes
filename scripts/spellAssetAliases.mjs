import { fileURLToPath } from 'node:url'

export const spellAssetAliases = {
  '@spell/en-us-aff': fileURLToPath(new URL('../node_modules/dictionary-en/index.aff', import.meta.url)),
  '@spell/en-us-dic': fileURLToPath(new URL('../node_modules/dictionary-en/index.dic', import.meta.url)),
  '@spell/en-gb-aff': fileURLToPath(new URL('../node_modules/dictionary-en-gb/index.aff', import.meta.url)),
  '@spell/en-gb-dic': fileURLToPath(new URL('../node_modules/dictionary-en-gb/index.dic', import.meta.url))
}

// Vite resolves aliases before its `?raw` transform, and exact aliases do not
// match an import with a query suffix. Derive these from the canonical map so
// the raw-import aliases cannot point at different assets.
export const spellRawAssetAliases = Object.fromEntries(
  Object.entries(spellAssetAliases).map(([name, path]) => [`${name}?raw`, `${path}?raw`])
)
