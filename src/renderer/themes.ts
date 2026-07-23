import type * as monaco from 'monaco-editor'
import { ACCENT_PALETTE } from '../shared/types'

export type ChromeKey =
  | '--bar' | '--bartext' | '--bar-hover' | '--tabbg' | '--tab-active-bg'
  | '--tab-inactive-text' | '--editorbg' | '--panel-bg' | '--panel-text'
  | '--statusbar-bg' | '--border' | '--muted' | '--accent' | '--accent-text'
  | '--accent-soft' | '--accent-readable' | '--danger'
export type ChromeTokens = Record<ChromeKey, string>

export const CHROME_KEYS: ChromeKey[] = [
  '--bar','--bartext','--bar-hover','--tabbg','--tab-active-bg','--tab-inactive-text',
  '--editorbg','--panel-bg','--panel-text','--statusbar-bg','--border','--muted',
  '--accent','--accent-text','--accent-soft','--accent-readable','--danger'
]

export interface ThemeDef {
  id: string
  label: string
  base: 'light' | 'dark'
  chrome: ChromeTokens
  monaco: monaco.editor.IStandaloneThemeData
}

interface Palette {
  base: 'light' | 'dark'
  bg: string; fg: string; bar: string; barText: string; dim: string
  tab: string; tabActive: string; border: string; accent: string
  /** Overrides for the derived ladder. Only set where the formula misfires — see monokai / high-contrast. */
  panel?: string; status?: string
  accentText?: string
  monacoBase?: monaco.editor.BuiltinTheme
  syntax?: { comment: string; string: string; keyword: string; number: string; type: string }
}

const hx = (c: string): string => c.replace('#', '')

function makeTheme(id: string, label: string, p: Palette): ThemeDef {
  const rules = p.syntax ? [
    { token: 'comment', foreground: hx(p.syntax.comment) },
    { token: 'string', foreground: hx(p.syntax.string) },
    { token: 'keyword', foreground: hx(p.syntax.keyword) },
    { token: 'number', foreground: hx(p.syntax.number) },
    { token: 'type', foreground: hx(p.syntax.type) }
  ] : []
  // Tonal ladder: overlays a half-step above chrome, the status bar a half-step below, so
  // depth reads without relying on 1px borders. Dark themes step up to lift a panel off the
  // chrome; light themes step down for the same reason.
  const up = p.base === 'dark'
  const panel = p.panel ?? shiftL(p.bar, up ? 4 : -3)
  const statusbar = p.status ?? shiftL(p.bar, up ? -3 : 2)
  return {
    id, label, base: p.base,
    chrome: {
      '--bar': p.bar, '--bartext': p.barText, '--bar-hover': 'rgba(127,127,127,.18)',
      '--tabbg': p.tab, '--tab-active-bg': p.tabActive, '--tab-inactive-text': p.dim,
      '--editorbg': p.bg, '--panel-bg': panel, '--panel-text': p.barText,
      '--statusbar-bg': statusbar,
      '--border': p.border, '--muted': p.dim, '--accent': p.accent,
      '--accent-text': p.accentText ?? contrastText(p.accent),
      '--accent-soft': p.accent + '33',
      '--accent-readable': readableOn(p.accent, p.bar),
      '--danger': '#e5484d'
    },
    monaco: {
      base: p.monacoBase ?? (p.base === 'dark' ? 'vs-dark' : 'vs'),
      inherit: true,
      rules,
      colors: {
        'editor.background': p.bg,
        'editor.foreground': p.fg,
        'editorLineNumber.foreground': p.dim,
        'editor.selectionBackground': p.accent + '55',
        'editorCursor.foreground': p.accent
      }
    }
  }
}

export const THEMES: Record<string, ThemeDef> = {
  light: makeTheme('light', 'Light', {
    base: 'light', bg: '#ffffff', fg: '#1e1e1e', bar: '#f3f3f3', barText: '#333333', dim: '#6e6e6e',
    tab: '#ececec', tabActive: '#ffffff', border: '#d4d4d4', accent: '#0a66c2'
  }),
  dark: makeTheme('dark', 'Dark', {
    base: 'dark', bg: '#1e1e1e', fg: '#d4d4d4', bar: '#252526', barText: '#cccccc', dim: '#858585',
    tab: '#2d2d2d', tabActive: '#1e1e1e', border: '#333333', accent: '#0a84ff'
  }),
  'dark-dimmed': makeTheme('dark-dimmed', 'Dark Dimmed', {
    base: 'dark', bg: '#22272e', fg: '#adbac7', bar: '#2d333b', barText: '#adbac7', dim: '#768390',
    tab: '#2d333b', tabActive: '#22272e', border: '#444c56', accent: '#539bf5',
    syntax: { comment: '#768390', string: '#96d0ff', keyword: '#f47067', number: '#6cb6ff', type: '#dcbdfb' }
  }),
  'solarized-dark': makeTheme('solarized-dark', 'Solarized Dark', {
    base: 'dark', bg: '#002b36', fg: '#93a1a1', bar: '#073642', barText: '#93a1a1', dim: '#586e75',
    tab: '#073642', tabActive: '#002b36', border: '#0a4a56', accent: '#268bd2',
    syntax: { comment: '#586e75', string: '#2aa198', keyword: '#859900', number: '#d33682', type: '#b58900' }
  }),
  'one-dark': makeTheme('one-dark', 'One Dark', {
    base: 'dark', bg: '#282c34', fg: '#abb2bf', bar: '#21252b', barText: '#abb2bf', dim: '#5c6370',
    tab: '#2c313a', tabActive: '#282c34', border: '#3b4048', accent: '#61afef',
    syntax: { comment: '#5c6370', string: '#98c379', keyword: '#c678dd', number: '#d19a66', type: '#e5c07b' }
  }),
  'solarized-light': makeTheme('solarized-light', 'Solarized Light', {
    base: 'light', bg: '#fdf6e3', fg: '#586e75', bar: '#eee8d5', barText: '#586e75', dim: '#93a1a1',
    tab: '#eee8d5', tabActive: '#fdf6e3', border: '#d9d2c0', accent: '#268bd2',
    syntax: { comment: '#93a1a1', string: '#2aa198', keyword: '#859900', number: '#d33682', type: '#b58900' }
  }),
  monokai: makeTheme('monokai', 'Monokai', {
    base: 'dark', bg: '#272822', fg: '#f8f8f2', bar: '#1e1f1c', barText: '#f8f8f2', dim: '#75715e',
    tab: '#2d2e28', tabActive: '#272822', border: '#3e3d32', accent: '#f92672',
    syntax: { comment: '#75715e', string: '#e6db74', keyword: '#f92672', number: '#ae81ff', type: '#66d9ef' }
  }),
  'high-contrast': makeTheme('high-contrast', 'High Contrast', {
    base: 'dark', bg: '#000000', fg: '#ffffff', bar: '#000000', barText: '#ffffff', dim: '#c0c0c0',
    tab: '#000000', tabActive: '#0d0d0d', border: '#6fc3df', accent: '#00a8ff',
    panel: '#000000', status: '#000000',
    monacoBase: 'hc-black'
  }),
  nord: makeTheme('nord', 'Nord', {
    base: 'dark', bg: '#2e3440', fg: '#d8dee9', bar: '#3b4252', barText: '#d8dee9', dim: '#616e88',
    tab: '#3b4252', tabActive: '#2e3440', border: '#434c5e', accent: '#88c0d0',
    syntax: { comment: '#616e88', string: '#a3be8c', keyword: '#81a1c1', number: '#b48ead', type: '#8fbcbb' }
  }),
  dracula: makeTheme('dracula', 'Dracula', {
    base: 'dark', bg: '#282a36', fg: '#f8f8f2', bar: '#21222c', barText: '#f8f8f2', dim: '#6272a4',
    tab: '#2a2c3a', tabActive: '#282a36', border: '#44475a', accent: '#bd93f9',
    syntax: { comment: '#6272a4', string: '#f1fa8c', keyword: '#ff79c6', number: '#bd93f9', type: '#8be9fd' }
  }),
  'gruvbox-dark': makeTheme('gruvbox-dark', 'Gruvbox Dark', {
    base: 'dark', bg: '#282828', fg: '#ebdbb2', bar: '#32302f', barText: '#ebdbb2', dim: '#928374',
    tab: '#3c3836', tabActive: '#282828', border: '#504945', accent: '#fe8019',
    syntax: { comment: '#928374', string: '#b8bb26', keyword: '#fb4934', number: '#d3869b', type: '#fabd2f' }
  }),
  'tokyo-night': makeTheme('tokyo-night', 'Tokyo Night', {
    base: 'dark', bg: '#1a1b26', fg: '#c0caf5', bar: '#16161e', barText: '#c0caf5', dim: '#565f89',
    tab: '#1f2335', tabActive: '#1a1b26', border: '#2f3549', accent: '#7aa2f7',
    syntax: { comment: '#565f89', string: '#9ece6a', keyword: '#bb9af7', number: '#ff9e64', type: '#2ac3de' }
  }),
  'gruvbox-light': makeTheme('gruvbox-light', 'Gruvbox Light', {
    base: 'light', bg: '#fbf1c7', fg: '#3c3836', bar: '#f2e5bc', barText: '#3c3836', dim: '#928374',
    tab: '#ebdbb2', tabActive: '#fbf1c7', border: '#d5c4a1', accent: '#af3a03',
    syntax: { comment: '#928374', string: '#79740e', keyword: '#9d0006', number: '#8f3f71', type: '#b57614' }
  })
}

// Theme id/label metadata now lives in `shared` (boundary-safe for the main-process menu);
// re-exported here so renderer consumers can keep importing it from `./themes`. The full
// `THEMES` defs (with monaco data) stay renderer-only; `sharedThemes.test.ts` guards alignment.
export { THEME_LIST, type ThemeMeta } from '../shared/themes'

// Accent swatches = the shared 18-colour palette (same source the highlighter uses).
export const ACCENT_SWATCHES = ACCENT_PALETTE

export function resolveThemeId(id: string): string {
  if (id === 'follow-os') {
    const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
  return THEMES[id] ? id : 'dark'
}

// The four representative chrome colours shown as dots on each row of the Appearance
// panel's theme list, in a fixed order: editor background, chrome bar, chrome text, accent.
// Routed through resolveThemeId so 'follow-os' previews whatever it currently resolves to
// (and an unknown id falls back to dark instead of throwing). The accent is each THEME's
// OWN accent, never the user's accent override — with the override applied, all 14 rows'
// accent dots would be identical and tell the user nothing.
export const SWATCH_KEYS: ChromeKey[] = ['--editorbg', '--bar', '--bartext', '--accent']

export function swatchColours(themeId: string): string[] {
  const c = THEMES[resolveThemeId(themeId)].chrome
  return SWATCH_KEYS.map(k => c[k])
}

// YIQ perceived-brightness → near-black text on light accents, white on dark, so
// accent-filled surfaces stay legible on any accent (fixes white-on-light). YIQ (not
// raw WCAG max-contrast) because max-contrast flips the conventional white-on-saturated-
// blue to dark; YIQ matches how accents are conventionally paired with text.
export function contrastText(hex: string): string {
  const [r, g, b] = toRgb(hex)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#111111' : '#ffffff'
}

// ── Lightness maths ──────────────────────────────────────────────────────────
// HSL round-trip rather than raw channel addition: adding a constant to r/g/b
// desaturates as it lightens, which turns tinted chrome (Nord, Dracula) grey.
// Pure and DOM-free so the ladder and the accent tokens are both unit-testable.

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0)
    : max === gn ? (bn - rn) / d + 2
      : (rn - gn) / d + 4
  return [h * 60, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = ln - c / 2
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]
}

// Function declaration (not a const arrow) so it's hoisted: makeTheme now derives the ladder
// eagerly while THEMES is being built at module load, via shiftL, before this line would
// otherwise have run — a const here would leave shiftL calling into its own temporal dead zone.
function hex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
}

/** Shift a hex colour's HSL lightness by `pct` points, clamped to [0,100]. */
export function shiftL(hex: string, pct: number): string {
  const [r, g, b] = toRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [r2, g2, b2] = hslToRgb(h, s, Math.max(0, Math.min(100, l + pct)))
  return '#' + hex2(r2) + hex2(g2) + hex2(b2)
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex)
  const ch = [r, g, b].map(v => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// The counterpart to contrastText(): that one picks TEXT to sit ON an accent fill; this one
// keeps an accent-COLOURED glyph legible on chrome. Needed because the accent is user-chosen
// from an 18-colour palette — a pale one (Yellow, Lime) on light chrome is otherwise invisible.
// Walks lightness away from the surface in 4-point steps and stops at 3:1 (the WCAG floor for
// a UI glyph). Bounded loop + a no-progress guard, so it terminates for any input including
// readableOn(x, x).
export function readableOn(fg: string, surface: string): string {
  const dir = luminance(surface) > 0.18 ? -4 : 4
  let out = fg
  for (let i = 0; i < 25; i++) {
    if (contrastRatio(out, surface) >= 3) return out
    const next = shiftL(out, dir)
    if (next === out) return out
    out = next
  }
  return out
}

export function chromeVars(themeId: string, accent?: string | null): ChromeTokens {
  const t = THEMES[resolveThemeId(themeId)]
  if (!accent) return t.chrome
  return {
    ...t.chrome,
    '--accent': accent,
    '--accent-text': contrastText(accent),
    '--accent-soft': accent + '33',
    '--accent-readable': readableOn(accent, t.chrome['--bar'])
  }
}

export function migrateThemeId(s: { themeId?: string; theme?: string }): string {
  return s.themeId ?? s.theme ?? 'dark'
}
