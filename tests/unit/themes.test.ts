import { describe, it, expect } from 'vitest'
import { THEMES, CHROME_KEYS, ACCENT_SWATCHES, chromeVars, contrastText, resolveThemeId, migrateThemeId, THEME_LIST, swatchColours, shiftL, readableOn, contrastRatio } from '../../src/renderer/themes'

const IDS = ['light','dark','dark-dimmed','solarized-dark','one-dark','solarized-light','monokai','high-contrast','nord','dracula','gruvbox-dark','tokyo-night','gruvbox-light']
const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

describe('themes', () => {
  it('registers every theme in IDS', () => { for (const id of IDS) expect(THEMES[id], id).toBeTruthy() })
  it('every theme has all 14 chrome keys', () => {
    expect(CHROME_KEYS).toHaveLength(14)
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
})
