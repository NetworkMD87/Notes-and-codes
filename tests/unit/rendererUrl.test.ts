import { describe, expect, it } from 'vitest'
import { trustedDevRendererUrl } from '../../src/main/rendererUrl'

describe('trustedDevRendererUrl', () => {
  it.each([
    'http://localhost:5173/',
    'https://127.0.0.1:5173/app',
    'http://[::1]:5173/',
  ])('accepts a loopback development renderer: %s', (raw) => {
    expect(trustedDevRendererUrl(raw, false)?.toString()).toBe(raw)
  })

  it.each([
    'https://example.com/app',
    'file:///C:/untrusted/index.html',
    'javascript:alert(1)',
    'not a url',
  ])('rejects an untrusted development renderer: %s', (raw) => {
    expect(trustedDevRendererUrl(raw, false)).toBeNull()
  })

  it('ignores the renderer environment variable in packaged builds', () => {
    expect(trustedDevRendererUrl('http://localhost:5173/', true)).toBeNull()
  })
})
