/// <reference types="vite/client" />

// Vite resolves `?worker` imports (see src/renderer/monacoEnv.ts) at build time and
// hands back a Worker constructor. tsc doesn't know that suffix, so declare it here.
declare module '*?worker' {
  const workerConstructor: new (options?: { name?: string }) => Worker
  export default workerConstructor
}
