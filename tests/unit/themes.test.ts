import { describe, it, expect } from 'vitest'
import { THEMES, CHROME_KEYS, ACCENT_SWATCHES, chromeVars, contrastText, resolveThemeId, migrateThemeId, THEME_LIST, swatchColours, shiftL, readableOn, contrastRatio } from '../../src/renderer/themes'

const IDS = ['light','dark','dark-dimmed','solarized-dark','one-dark','solarized-light','monokai','high-contrast','nord','dracula','gruvbox-dark','tokyo-night','gruvbox-light']
const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

describe('themes', () => {
  it('registers every theme in IDS', () => { for (const id of IDS) expect(THEMES[id], id).toBeTruthy() })
  it('every theme has all 17 chrome keys', () => {
    expect(CHROME_KEYS).toHaveLength(17)
    for (const id of IDS) for (const k of CHROME_KEYS) expect(THEMES[id].chrome[k], `${id} ${k}`).toBeTruthy()
  })
  it('every theme monaco.base is valid; accent is hex', () => {
    const bases = ['vs','vs-dark','hc-black','hc-light']
    for (const id of IDS) {
      expect(bases).toContain(THEMES[id].monaco.base)
      expect(THEMES[id].chrome['--accent']).toMatch(hex)
      expect(['light','dark']).toContain(THEMES[id].base)
    }
  })
  it('ACCENT_SWATCHES are valid hex', () => {
    expect(ACCENT_SWATCHES.length).toBeGreaterThan(3)
    for (const s of ACCENT_SWATCHES) expect(s.value).toMatch(hex)
  })
  it('chromeVars applies an accent override', () => {
    expect(chromeVars('dark')['--accent']).toBe(THEMES.dark.chrome['--accent'])
    const o = chromeVars('dark', '#123456')
    expect(o['--accent']).toBe('#123456'); expect(o['--accent-text']).toBe('#ffffff')
  })
  it('resolveThemeId maps follow-os to a real palette and unknown to dark', () => {
    expect(IDS).toContain(resolveThemeId('follow-os'))
    expect(resolveThemeId('nope')).toBe('dark')
    expect(resolveThemeId('one-dark')).toBe('one-dark')
  })
  it('migrateThemeId prefers themeId, falls back to legacy theme, then dark', () => {
    expect(migrateThemeId({ themeId: 'monokai', theme: 'light' })).toBe('monokai')
    expect(migrateThemeId({ theme: 'light' })).toBe('light')
    expect(migrateThemeId({})).toBe('dark')
  })
  it('THEME_LIST covers the 8 + follow-os', () => {
    const ids = THEME_LIST.map(t => t.id)
    for (const id of IDS) expect(ids).toContain(id)
    expect(ids).toContain('follow-os')
  })
})

describe('contrastText', () => {
  it('picks white on dark accents, near-black on light', () => {
    expect(contrastText('#0a84ff')).toBe('#ffffff') // blue
    expect(contrastText('#eab308')).toBe('#111111') // yellow
    expect(contrastText('#ffffff')).toBe('#111111')
    expect(contrastText('#000000')).toBe('#ffffff')
  })
  it('supports 3-digit hex', () => {
    expect(contrastText('#fff')).toBe('#111111')
    expect(contrastText('#000')).toBe('#ffffff')
  })
})

describe('chromeVars accent-text auto-contrast', () => {
  it('derives dark text for a light custom accent', () => {
    expect(chromeVars('dark', '#eab308')['--accent-text']).toBe('#111111')
  })
  it('keeps white text for a dark custom accent', () => {
    expect(chromeVars('dark', '#0a84ff')['--accent-text']).toBe('#ffffff')
  })
})

describe('swatchColours', () => {
  it('returns editorbg, bar, bartext, accent — in that order — for every theme', () => {
    for (const id of IDS) {
      expect(swatchColours(id), id).toEqual([
        THEMES[id].chrome['--editorbg'],
        THEMES[id].chrome['--bar'],
        THEMES[id].chrome['--bartext'],
        THEMES[id].chrome['--accent']
      ])
    }
  })
  it('gives every THEME_LIST entry — including follow-os — four valid hex colours', () => {
    for (const t of THEME_LIST) {
      const c = swatchColours(t.id)
      expect(c, t.id).toHaveLength(4)
      for (const v of c) expect(v, `${t.id} ${v}`).toMatch(hex)
    }
  })
  it('resolves follow-os to a real theme palette', () => {
    expect(swatchColours('follow-os')).toEqual(swatchColours(resolveThemeId('follow-os')))
  })
  it('falls back to dark for an unknown id rather than throwing', () => {
    expect(swatchColours('nope')).toEqual(swatchColours('dark'))
  })
})

describe('shiftL', () => {
  it('lightens toward white and darkens toward black', () => {
    const base = '#0a84ff'
    // A lighter colour contrasts LESS against white; a darker one contrasts MORE.
    expect(contrastRatio(shiftL(base, 20), '#ffffff')).toBeLessThan(contrastRatio(base, '#ffffff'))
    expect(contrastRatio(shiftL(base, -20), '#ffffff')).toBeGreaterThan(contrastRatio(base, '#ffffff'))
  })
  it('clamps at both ends instead of wrapping', () => {
    expect(shiftL('#ffffff', 20)).toBe('#ffffff')
    expect(shiftL('#000000', -20)).toBe('#000000')
  })
  it('accepts 3-digit hex and always returns 6-digit', () => {
    expect(shiftL('#000', 100)).toBe('#ffffff')
    expect(shiftL('#fff', 0)).toBe('#ffffff')
  })
  it('keeps a grey grey (no hue drift on a zero-saturation input)', () => {
    const out = shiftL('#252526', 4)
    const r = out.slice(1, 3), g = out.slice(3, 5), b = out.slice(5, 7)
    expect(Math.abs(parseInt(r, 16) - parseInt(b, 16))).toBeLessThanOrEqual(2)
    expect(Math.abs(parseInt(g, 16) - parseInt(b, 16))).toBeLessThanOrEqual(2)
  })
})

describe('readableOn', () => {
  it('corrects a pale accent on light chrome', () => {
    const out = readableOn('#eab308', '#f3f3f3') // yellow on Light theme bar
    expect(out).not.toBe('#eab308')
    expect(contrastRatio(out, '#f3f3f3')).toBeGreaterThanOrEqual(3)
  })
  it('leaves an already-legible accent untouched', () => {
    expect(readableOn('#0a84ff', '#252526')).toBe('#0a84ff')
  })
  it('is idempotent', () => {
    const once = readableOn('#eab308', '#f3f3f3')
    expect(readableOn(once, '#f3f3f3')).toBe(once)
  })
  it('terminates on the degenerate same-colour case', () => {
    const out = readableOn('#000000', '#000000')
    expect(out).toMatch(/^#[0-9a-f]{6}$/)
    expect(contrastRatio(out, '#000000')).toBeGreaterThanOrEqual(3)
  })
  it('corrects a dark accent on dark chrome (the +4 lighten branch)', () => {
    // Mirror of the light-chrome case above: a low-contrast accent on a DARK bar must be
    // lightened, exercising readableOn's dir=+4 branch on a real colour — not only the
    // degenerate same-colour case.
    const out = readableOn('#1e3a5f', '#252526') // dark navy on the Dark theme bar
    expect(out).not.toBe('#1e3a5f')
    expect(contrastRatio(out, '#252526')).toBeGreaterThanOrEqual(3)
  })
})

describe('contrastRatio', () => {
  it('spans 1 (identical) to 21 (black on white)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5) // order-independent
    expect(contrastRatio('#7f7f7f', '#7f7f7f')).toBe(1)            // identical colours → the 1 floor
  })
})

describe('tonal ladder', () => {
  // Higher contrast against black == lighter colour. Avoids exporting luminance just for tests.
  const lighter = (a: string, b: string): boolean =>
    contrastRatio(a, '#000000') > contrastRatio(b, '#000000')

  it('gives every theme three distinct chrome levels, except High Contrast', () => {
    for (const id of IDS) {
      const c = THEMES[id].chrome
      for (const k of ['--bar', '--panel-bg', '--statusbar-bg'] as const) {
        expect(c[k], `${id} ${k}`).toMatch(hex)
      }
      if (id === 'high-contrast') continue
      expect(c['--panel-bg'], id).not.toBe(c['--bar'])
      expect(c['--statusbar-bg'], id).not.toBe(c['--bar'])
    }
  })
  it('opts High Contrast out of the ladder on purpose (borders carry structure there)', () => {
    const c = THEMES['high-contrast'].chrome
    expect(c['--panel-bg']).toBe(c['--bar'])
    expect(c['--statusbar-bg']).toBe(c['--bar'])
  })
  it('puts panels above and the status bar below chrome, per base', () => {
    for (const id of IDS) {
      if (id === 'high-contrast') continue
      const c = THEMES[id].chrome
      const up = THEMES[id].base === 'dark'
      expect(lighter(c['--panel-bg'], c['--bar']), `${id} panel`).toBe(up)
      expect(lighter(c['--statusbar-bg'], c['--bar']), `${id} statusbar`).toBe(!up)
    }
  })
})

describe('accent-derived tokens', () => {
  it('derives soft + readable from the theme accent', () => {
    const c = THEMES.dark.chrome
    expect(c['--accent-soft']).toBe(c['--accent'] + '33')
    expect(c['--accent-readable']).toMatch(hex)
  })
  it('re-derives BOTH from a custom accent, not the theme accent', () => {
    const o = chromeVars('light', '#eab308')
    expect(o['--accent-soft']).toBe('#eab30833')
    expect(o['--accent-readable']).not.toBe(THEMES.light.chrome['--accent-readable'])
    expect(contrastRatio(o['--accent-readable'], THEMES.light.chrome['--bar'])).toBeGreaterThanOrEqual(3)
  })
  it('leaves the ladder alone when only the accent is overridden', () => {
    const o = chromeVars('dark', '#eab308')
    expect(o['--panel-bg']).toBe(THEMES.dark.chrome['--panel-bg'])
    expect(o['--statusbar-bg']).toBe(THEMES.dark.chrome['--statusbar-bg'])
  })
})

describe('monaco editor colours', () => {
  it('marks the cursor line number with the theme accent', () => {
    for (const id of IDS) {
      expect(THEMES[id].monaco.colors!['editorLineNumber.activeForeground'], id)
        .toBe(THEMES[id].chrome['--accent'])
    }
  })
  it('defines a faint line highlight and indent guides for every theme', () => {
    for (const id of IDS) {
      const c = THEMES[id].monaco.colors!
      for (const k of ['editor.lineHighlightBackground', 'editorIndentGuide.background',
        'editorIndentGuide.activeBackground']) {
        expect(c[k], `${id} ${k}`).toMatch(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i)
      }
    }
  })
  it('keeps the line highlight under 10% alpha so highlighter pen colours do not drift', () => {
    for (const id of IDS) {
      const v = THEMES[id].monaco.colors!['editor.lineHighlightBackground']
      expect(v.length, `${id} needs an 8-digit hex`).toBe(9)
      expect(parseInt(v.slice(7, 9), 16), id).toBeLessThanOrEqual(26) // 26/255 ≈ 10%
    }
  })
})
