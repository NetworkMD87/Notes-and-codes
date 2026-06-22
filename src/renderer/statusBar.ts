import type { EolMode } from '../shared/types'

export class StatusBar {
  constructor(private el: HTMLElement) {}
  update(info: { language: string; eol: EolMode; cursor: { line: number; col: number }; dirty: boolean }): void {
    this.el.replaceChildren()
    const parts = [
      info.language,
      info.eol,
      `Ln ${info.cursor.line}, Col ${info.cursor.col}`,
      info.dirty ? '● unsaved' : '● saved'
    ]
    for (const p of parts) { const s = document.createElement('span'); s.textContent = p; this.el.appendChild(s) }
  }
}
