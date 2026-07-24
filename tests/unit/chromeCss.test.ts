import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/index.html', 'utf8')

/** The single CSS declaration block for a selector, e.g. '.palette-box'. */
function ruleFor(selector: string): string {
  // Match `selector{` only as a standalone RULE HEAD — at a boundary (start of file,
  // whitespace, or after a `}`), never the tail of a grouped list like `.a,.b,.toast{…}`
  // (a different rule; a bare substring match would latch onto it). Asserting exactly one
  // such head also guards against a future duplicate rule silently shadowing this one.
  const head = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{'
  const heads = [...css.matchAll(new RegExp('(?:^|[\\s}])' + head, 'g'))]
  expect(heads.length, `selector ${selector} should appear exactly once as a rule head, found ${heads.length}`).toBe(1)
  const i = css.indexOf(selector + '{', heads[0].index)
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
      '.snip-mgr-box', '.input-box', '.diff-picker-box', '.toast', '#ctx-menu', '.tb-hl-pop', '.ph-list,.snip-list']) {
      expect(ruleFor(sel), sel).toContain('border-radius:var(--radius-lg)')
    }
  })
  it('keeps the full-strength accent border on floating chrome (idea #3 was rejected)', () => {
    for (const sel of ['.palette-box', '.settings-box', '.toast', '#ctx-menu']) {
      expect(ruleFor(sel), sel).toContain('border:1px solid var(--accent)')
    }
  })
  it('migrates .tb-hl-pop shadow to --shadow variable', () => {
    const rule = ruleFor('.tb-hl-pop')
    expect(rule, '.tb-hl-pop').toContain('box-shadow:var(--shadow)')
    expect(rule, '.tb-hl-pop').not.toContain('0 4px 14px rgba(0,0,0,.3)')
  })
})

describe('active toolbar button', () => {
  it('uses a tint plus a readable glyph, not a solid accent block', () => {
    const rule = ruleFor('.tb-btn.tb-active')
    expect(rule).toContain('background:var(--accent-soft)')
    expect(rule).toContain('color:var(--accent-readable)')
    expect(rule).not.toContain('background:var(--accent)')
  })
})

describe('toast severity', () => {
  it('defines --success and --warning as root constants', () => {
    const root = ruleFor(':root')
    expect(root).toContain('--success:')
    expect(root).toContain('--warning:')
  })
  it('routes the toast left bar + glyph through --toast-accent', () => {
    expect(ruleFor('.toast')).toContain('inset 3px 0 0 var(--toast-accent')
    expect(ruleFor('.toast-glyph')).toContain('var(--toast-accent')
  })
  it('maps each severity level to its semantic colour', () => {
    const map: Record<string, string> = {
      '.toast--info': '--accent', '.toast--success': '--success',
      '.toast--warning': '--warning', '.toast--error': '--danger',
    }
    for (const [sel, v] of Object.entries(map)) {
      expect(ruleFor(sel), sel).toContain('--toast-accent:var(' + v + ')')
    }
  })
})

describe('calmer active list row', () => {
  it('tints the active palette + quick-open row with a left bar, not a solid fill', () => {
    for (const sel of ['.palette-row.active', '.qo-row.active']) {
      const rule = ruleFor(sel)
      expect(rule, sel).toContain('background:var(--accent-soft)')
      expect(rule, sel).toContain('color:var(--accent-readable)')
      expect(rule, sel).toContain('inset 3px 0 0 var(--accent)')
      expect(rule, sel).not.toContain('background:var(--accent)')
    }
  })
  it('decouples quick-open hover from active (hover uses --bar-hover)', () => {
    expect(ruleFor('.qo-row:hover')).toContain('background:var(--bar-hover)')
  })
})

describe('keyboard focus rings', () => {
  it('draws a 2px accent outline on :focus-visible chrome', () => {
    // A rule that targets :focus-visible and sets a 2px accent outline must exist.
    expect(css).toMatch(/:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--accent\)/)
  })
})

describe('floating change banner', () => {
  it('is panel chrome with an accent border and a warning left bar, not a solid accent slab', () => {
    const rule = ruleFor('#change-bar')
    expect(rule).toContain('background:var(--panel-bg)')
    expect(rule).toContain('border:1px solid var(--accent)')
    expect(rule).toContain('border-radius:var(--radius-lg)')
    expect(rule).toContain('--toast-accent:var(--warning)')
    expect(rule).toContain('inset 3px 0 0 var(--toast-accent)')
    expect(rule).not.toContain('background:var(--accent)')
    expect(rule).not.toContain('left:0;right:0') // no longer a full-width slab
  })
})

describe('sidebar header caption', () => {
  it('is a muted uppercase caption', () => {
    const rule = ruleFor('.sb-header')
    expect(rule).toContain('text-transform:uppercase')
    expect(rule).toContain('color:var(--muted)')
  })
})

describe('sidebar indent guides', () => {
  it('draws depth-driven vertical guides on rows, suppressed on active/hover', () => {
    const row = ruleFor('.sb-row')
    expect(row).toContain('repeating-linear-gradient')
    expect(row).toContain('var(--depth')
    expect(ruleFor('.sb-row.active')).toContain('background-image:none')
    expect(ruleFor('.sb-row:hover')).toContain('background-image:none')
  })
})
