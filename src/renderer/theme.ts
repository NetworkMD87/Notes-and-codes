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

  // Paint only — body dataset + CSS custom properties + Monaco — WITHOUT touching the
  // committed themeId/accent. No-ops when the same resolved theme + accent is already on
  // screen, so sweeping the Appearance panel's theme list doesn't re-theme Monaco once
  // per row. `painted` is keyed on the RESOLVED id so a follow-os OS flip still repaints.
  private paint(themeId: string, accent: string | null): void {
    const resolved = resolveThemeId(themeId)
    const key = resolved + '|' + (accent ?? '')
    if (key === this.painted) return
    this.painted = key
    const vars = chromeVars(themeId, accent)
    document.body.dataset.theme = resolved
    for (const [k, v] of Object.entries(vars)) document.body.style.setProperty(k, v)
    for (const p of this.panes) p.setTheme(resolved)
  }

  apply(themeId: string, accent: string | null = null): void {
    this.themeId = themeId
    this.accent = accent
    this.paint(themeId, accent)
  }

  // Hover preview in the Appearance panel: paints a theme without committing it. Uses the
  // committed accent, so what you see under the cursor is exactly what a click would give
  // you. currentId() keeps reporting the committed theme, so the panel's active-row
  // highlight doesn't move. onPersist is reachable only from pick()/setAccent(), so a
  // previewed theme can never be written to settings — by construction, not by care.
  preview(themeId: string): void { this.paint(themeId, this.accent) }
  endPreview(): void { this.paint(this.themeId, this.accent) }

  pick(themeId: string): void { this.apply(themeId, this.accent); this.onPersist(this.themeId, this.accent) }
  setAccent(accent: string | null): void { this.apply(this.themeId, accent); this.onPersist(this.themeId, this.accent) }
  currentId(): string { return this.themeId }
  currentAccent(): string | null { return this.accent }
}
