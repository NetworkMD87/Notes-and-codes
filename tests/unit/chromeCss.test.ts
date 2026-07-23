import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/index.html', 'utf8')

/** The single CSS declaration block for a selector, e.g. '.palette-box'. */
function ruleFor(selector: string): string {
  const i = css.indexOf(selector + '{')
  expect(i, `selector ${selector} not found`).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i))
}

describe('floating chrome tokens', () => {
  it('defines --radius-lg alongside --radius', () => {
    expect(css).toMatch(/--radius:4px/)
    expect(css).toMatch(/--radius-lg:10px/)
  })
  it('uses a two-layer shadow', () => {
    // One rgba() layer is 4 comma-separated fragments, two layers are 8 — so >=6 fails on the
    // old single-layer value and passes on the new one.
    const root = ruleFor(':root')
    expect(root.match(/--shadow:[^;]+/)?.[0].split(',').length).toBeGreaterThanOrEqual(6)
  })
  it('rounds every overlay box with --radius-lg', () => {
    for (const sel of ['.palette-box', '.qo-box', '.settings-box', '.help-box', '.fh-box',
      '.snip-mgr-box', '.input-box', '.diff-picker-box', '.toast', '#ctx-menu', '.tb-hl-pop']) {
      expect(ruleFor(sel), sel).toContain('border-radius:var(--radius-lg)')
    }
  })
  it('keeps the full-strength accent border on floating chrome (idea #3 was rejected)', () => {
    for (const sel of ['.palette-box', '.settings-box', '.toast', '#ctx-menu']) {
      expect(ruleFor(sel), sel).toContain('border:1px solid var(--accent)')
    }
  })
})
