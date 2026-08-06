/// <reference types="vite/client" />

// Vite resolves `?worker` imports (see src/renderer/monacoEnv.ts) at build time and
// hands back a Worker constructor. tsc doesn't know that suffix, so declare it here.
declare module '*?worker' {
  const workerConstructor: new (options?: { name?: string }) => Worker
  export default workerConstructor
}

declare module '*?raw' {
  const content: string
  export default content
}

declare module 'nspell' {
  interface Nspell {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string): void
    remove(word: string): void
  }

  function nspell(dictionary: { aff: string; dic: string }): Nspell
  export default nspell
}
