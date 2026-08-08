import type { EolMode, Encoding } from '../shared/types'

export interface StatusHandlers {
  onEol: (eol: EolMode) => void
  onEncoding: (enc: Encoding) => void
}
const ENCODING_OPTIONS: [Encoding, string][] = [
  ['utf8', 'UTF-8'],
  ['utf8bom', 'UTF-8 BOM'],
  ['utf16le', 'UTF-16 LE'],
  ['utf16be', 'UTF-16 BE'],
]

export class StatusBar {
  constructor(private el: HTMLElement, private handlers: StatusHandlers) {}

  update(info: { language: string; eol: EolMode; encoding: Encoding; cursor: { line: number; col: number }; dirty: boolean }): void {
    this.el.replaceChildren()
    const span = (text: string) => { const s = document.createElement('span'); s.textContent = text; return s }

    this.el.appendChild(span(info.language))

    const note = document.createElement('span')
    note.id = 'status-format-note'
    note.className = 'sr-only'
    note.textContent = 'The selected format is written on the next save of this file.'

    const encoding = document.createElement('select')
    encoding.className = 'sb-select'
    encoding.setAttribute('aria-label', 'File encoding')
    encoding.setAttribute('aria-describedby', note.id)
    for (const [value, label] of ENCODING_OPTIONS) encoding.add(new Option(label, value))
    encoding.value = info.encoding
    encoding.onchange = () => this.handlers.onEncoding(encoding.value as Encoding)
    this.el.appendChild(encoding)

    const eol = document.createElement('select')
    eol.className = 'sb-select'
    eol.setAttribute('aria-label', 'Line endings')
    eol.setAttribute('aria-describedby', note.id)
    for (const value of ['LF', 'CRLF'] as const) eol.add(new Option(value, value))
    eol.value = info.eol
    eol.onchange = () => this.handlers.onEol(eol.value as EolMode)
    this.el.appendChild(eol)

    this.el.appendChild(note)

    this.el.appendChild(span(`Ln ${info.cursor.line}, Col ${info.cursor.col}`))
    const state = span(info.dirty ? '● unsaved' : '● saved')
    state.className = 'sb-state' + (info.dirty ? ' sb-dirty' : '')
    this.el.appendChild(state)
  }
}
