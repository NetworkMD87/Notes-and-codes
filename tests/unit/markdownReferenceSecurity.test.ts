import { resolve } from 'node:path'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'

interface RenderResult {
  heading: boolean
  href: string | undefined
  textLength: number
}

// Bound the affected parser stage in a separate worker. A synchronous parser
// hang cannot be interrupted by a Vitest timeout in the same thread.
async function parseIsolated(source: string): Promise<RenderResult> {
  const worker = new Worker(resolve('tests/fixtures/markdownReferenceWorker.cjs'), {
    resourceLimits: { maxOldGenerationSizeMb: 128 },
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await new Promise<RenderResult>((resolveResult, reject) => {
      timer = setTimeout(() => reject(new Error('Markdown worker did not initialize within 15 seconds')), 15_000)
      worker.once('error', reject)
      worker.once('exit', code => reject(new Error(`Markdown worker exited before its result (${code})`)))
      worker.on('message', (message: 'ready' | RenderResult) => {
        if (message === 'ready') {
          clearTimeout(timer)
          timer = setTimeout(() => reject(new Error('Malformed reference blocked the parser for 5 seconds')), 5_000)
          worker.postMessage(source)
        } else {
          resolveResult(message)
        }
      })
    })
  } finally {
    clearTimeout(timer)
    await worker.terminate()
  }
}

describe('malformed Markdown reference availability (GHSA-gfr2-rv44-r23c)', () => {
  it.each([
    ['unclosed label', '[' + 'a\n'.repeat(400_000)],
    ['unclosed title', '[x]: /url "\n' + 'a\n'.repeat(400_000)],
  ])('finishes an %s and retains subsequent valid Markdown', async (_label, malformed) => {
    const result = await parseIsolated(malformed + '\n\n# Recovered\n\n[normal][ok]\n\n[ok]: https://example.com\n')
    expect(result.heading).toBe(true)
    expect(result.href).toBe('https://example.com')
    // Reject truncation, reference-rule disabling, or dropping the bad paragraph
    // as a supposed fix: malformed input must still be displayed as ordinary text.
    expect(result.textLength).toBeGreaterThan(800_000)
  }, 25_000)
})
