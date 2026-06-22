import type { EolMode, Encoding } from '../shared/types'

export interface StatusHandlers {
  onEol: (eol: EolMode) => void
  onEncoding: (enc: Encoding) => void
}
const ENCODINGS: Encoding[] = ['utf8', 'utf8bom', 'utf16le', 'utf16be']
const ENC_LABEL: Record<Encoding, string> = { utf8: 'UTF-8', utf8bom: 'UTF-8-BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE' }

export class StatusBar {
  constructor(private el: HTMLElement, private handlers: StatusHandlers) {}

  update(info: { language: string; eol: EolMode; encoding: Encoding; cursor: { line: number; col: number }; dirty: boolean }): void {
    this.el.replaceChildren()
    const span = (text: string) => { const s = document.createElement('span'); s.textContent = text; return s }

    this.el.appendChild(span(info.language))

    const enc = span(ENC_LABEL[info.encoding]); enc.className = 'sb-click'
    enc.onclick = () => this.cycleEncoding(info.encoding)
    this.el.appendChild(enc)

    const eol = span(info.eol); eol.className = 'sb-click'
    eol.onclick = () => this.handlers.onEol(info.eol === 'LF' ? 'CRLF' : 'LF')
    this.el.appendChild(eol)

    this.el.appendChild(span(`Ln ${info.cursor.line}, Col ${info.cursor.col}`))
    this.el.appendChild(span(info.dirty ? '● unsaved' : '● saved'))
  }

  private cycleEncoding(current: Encoding): void {
    const next = ENCODINGS[(ENCODINGS.indexOf(current) + 1) % ENCODINGS.length]
    this.handlers.onEncoding(next)
  }
}
