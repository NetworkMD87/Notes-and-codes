import type * as monaco from 'monaco-editor'

export type ChromeKey =
  | '--bar' | '--bartext' | '--bar-hover' | '--tabbg' | '--tab-active-bg'
  | '--tab-inactive-text' | '--editorbg' | '--panel-bg' | '--panel-text'
  | '--border' | '--muted' | '--accent' | '--accent-text' | '--danger'
export type ChromeTokens = Record<ChromeKey, string>

export const CHROME_KEYS: ChromeKey[] = [
  '--bar','--bartext','--bar-hover','--tabbg','--tab-active-bg','--tab-inactive-text',
  '--editorbg','--panel-bg','--panel-text','--border','--muted','--accent','--accent-text','--danger'
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
  return {
    id, label, base: p.base,
    chrome: {
      '--bar': p.bar, '--bartext': p.barText, '--bar-hover': 'rgba(127,127,127,.18)',
      '--tabbg': p.tab, '--tab-active-bg': p.tabActive, '--tab-inactive-text': p.dim,
      '--editorbg': p.bg, '--panel-bg': p.bar, '--panel-text': p.barText,
      '--border': p.border, '--muted': p.dim, '--accent': p.accent,
      '--accent-text': p.accentText ?? '#ffffff', '--danger': '#e5484d'
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
    monacoBase: 'hc-black'
  })
}

export const THEME_LIST: { id: string; label: string }[] = [
  ...Object.values(THEMES).map(t => ({ id: t.id, label: t.label })),
  { id: 'follow-os', label: 'Follow OS' }
]

export const ACCENT_SWATCHES: { name: string; value: string }[] = [
  { name: 'Blue', value: '#0a84ff' }, { name: 'Teal', value: '#14b8a6' },
  { name: 'Green', value: '#16a34a' }, { name: 'Purple', value: '#9333ea' },
  { name: 'Orange', value: '#ea580c' }, { name: 'Pink', value: '#db2777' }
]

export function resolveThemeId(id: string): string {
  if (id === 'follow-os') {
    const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
  return THEMES[id] ? id : 'dark'
}

export function chromeVars(themeId: string, accent?: string | null): ChromeTokens {
  const t = THEMES[resolveThemeId(themeId)]
  if (accent) return { ...t.chrome, '--accent': accent, '--accent-text': '#ffffff' }
  return t.chrome
}

export function migrateThemeId(s: { themeId?: string; theme?: string }): string {
  return s.themeId ?? s.theme ?? 'dark'
}
