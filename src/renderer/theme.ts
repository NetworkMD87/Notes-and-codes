import * as monaco from 'monaco-editor'
import type { EditorPane } from './editorPane'
import { THEMES, chromeVars, resolveThemeId } from './themes'

export class ThemeController {
  private themeId = 'dark'
  private accent: string | null = null
  private painted = ''

  constructor(private panes: EditorPane[], private onPersist: (themeId: string, accent: string | null) => void) {
    for (const t of Object.values(THEMES)) monaco.editor.defineTheme(t.id, t.monaco)
    // Re-resolve 'follow-os' live when the OS theme flips while the app is running.
    if (typeof matchMedia !== 'undefined') {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.themeId === 'follow-os') this.apply('follow-os', this.accent)
      })
    }
  }

  // Paint — body dataset + CSS custom properties + Monaco. No-ops when the same resolved
  // theme + accent is already on screen, so re-picking the active theme, or a settings
  // re-render, costs nothing. `painted` is keyed on the RESOLVED id so a follow-os OS flip
  // still repaints. Private, and `apply()` is its only caller: painting a theme the
  // controller has NOT committed is what the deleted hover preview did, and the repaint it
  // caused (all chrome vars + setTheme on both panes, twice per pass) is what read as a
  // flicker. Keep paint reachable only through a state change.
  private paint(themeId: string, accent: string | null): void {
    const resolved = resolveThemeId(themeId)
    const key = resolved + '|' + (accent ?? '')
    if (key === this.painted) return
    const vars = chromeVars(themeId, accent)
    document.body.dataset.theme = resolved
    for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(k, v)
    for (const p of this.panes) p.setTheme(resolved)
    this.painted = key
  }

  apply(themeId: string, accent: string | null = null): void {
    this.themeId = themeId
    this.accent = accent
    this.paint(themeId, accent)
  }

  pick(themeId: string): void { this.apply(themeId, this.accent); this.onPersist(this.themeId, this.accent) }
  setAccent(accent: string | null): void { this.apply(this.themeId, accent); this.onPersist(this.themeId, this.accent) }
  currentId(): string { return this.themeId }
  currentAccent(): string | null { return this.accent }
}
