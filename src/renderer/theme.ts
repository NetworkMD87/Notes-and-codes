import type { EditorPane } from './editorPane'
import type { ThemeMode } from '../shared/types'

export class ThemeController {
  private mode: ThemeMode = 'follow-os'
  constructor(private panes: EditorPane[], private onPersist: (m: ThemeMode) => void) {}

  private resolve(m: ThemeMode): 'light' | 'dark' {
    if (m === 'follow-os') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return m
  }

  apply(mode: ThemeMode = 'follow-os'): void {
    this.mode = mode
    const resolved = this.resolve(mode)
    document.body.dataset.theme = resolved
    for (const p of this.panes) p.setTheme(resolved === 'dark' ? 'vs-dark' : 'vs')
  }

  current(): ThemeMode { return this.mode }

  cycle(): ThemeMode {
    const next: ThemeMode = this.mode === 'light' ? 'dark' : this.mode === 'dark' ? 'follow-os' : 'light'
    this.apply(next); this.onPersist(next); return next
  }
}
