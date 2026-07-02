import { describe, it, expect } from 'vitest'
import { uiFontStack } from '../../src/renderer/uiFont'

describe('uiFontStack', () => {
  it("maps 'System' to the built-in UI stack (no visual change)", () => {
    expect(uiFontStack('System')).toBe('Segoe UI, system-ui, sans-serif')
  })
  it('quotes a named font and appends fallbacks', () => {
    expect(uiFontStack('Fira Code')).toBe("'Fira Code', system-ui, sans-serif")
  })
  it('treats a custom font name the same way', () => {
    expect(uiFontStack('My Font')).toBe("'My Font', system-ui, sans-serif")
  })
})
