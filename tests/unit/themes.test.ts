import { describe, it, expect } from 'vitest'
import { THEMES, CHROME_KEYS, ACCENT_SWATCHES, chromeVars, resolveThemeId, migrateThemeId, THEME_LIST } from '../../src/renderer/themes'

const IDS = ['light','dark','dark-dimmed','solarized-dark','one-dark','solarized-light','monokai','high-contrast']
const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

describe('themes', () => {
  it('has the 8 themes', () => { for (const id of IDS) expect(THEMES[id], id).toBeTruthy() })
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
