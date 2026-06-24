import * as monaco from 'monaco-editor'
import type { EditorPane } from './editorPane'
import { THEMES, chromeVars, resolveThemeId } from './themes'

export class ThemeController {
  private themeId = 'dark'
  private accent: string | null = null

  constructor(private panes: EditorPane[], private onPersist: (themeId: string, accent: string | null) => void) {
    for (const t of Object.values(THEMES)) monaco.editor.defineTheme(t.id, t.monaco)
  }

  apply(themeId: string, accent: string | null = null): void {
    this.themeId = themeId
    this.accent = accent
    const resolved = resolveThemeId(themeId)
    const vars = chromeVars(themeId, accent)
    document.body.dataset.theme = resolved
    for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(k, v)
    for (const p of this.panes) p.setTheme(resolved)
  }

  pick(themeId: string): void { this.apply(themeId, this.accent); this.onPersist(this.themeId, this.accent) }
  setAccent(accent: string | null): void { this.apply(this.themeId, accent); this.onPersist(this.themeId, this.accent) }
  currentId(): string { return this.themeId }
  currentAccent(): string | null { return this.accent }
}
