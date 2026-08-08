import type { BufferState } from '../shared/types'
import { DialogController } from './dialogController'

export class DiffPicker {
  private overlay: HTMLDivElement
  private box: HTMLDivElement
  private leftSel: HTMLSelectElement
  private rightSel: HTMLSelectElement
  private onConfirm: ((leftId: string, rightId: string) => void) | null = null
  private dialog: DialogController

  constructor(host: HTMLElement, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div')
    this.overlay.className = 'diff-picker hidden'
    this.leftSel = document.createElement('select')
    this.leftSel.id = 'diff-left'
    this.rightSel = document.createElement('select')
    this.rightSel.id = 'diff-right'
    const compare = document.createElement('button')
    compare.textContent = 'Compare'
    compare.onclick = () => this.confirm()
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    cancel.onclick = () => this.close()
    this.box = document.createElement('div')
    this.box.className = 'diff-picker-box'
    const title = document.createElement('h2'); title.id = 'diff-picker-title'; title.textContent = 'Compare tabs'
    const lLbl = document.createElement('label'); lLbl.textContent = 'Left'; lLbl.htmlFor = this.leftSel.id
    const rLbl = document.createElement('label'); rLbl.textContent = 'Right'; rLbl.htmlFor = this.rightSel.id
    this.box.append(title, lLbl, this.leftSel, rLbl, this.rightSel, compare, cancel)
    this.overlay.appendChild(this.box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    // Escape handled centrally by overlayManager.
  }

  open(buffers: BufferState[], onConfirm: (leftId: string, rightId: string) => void): void {
    this.onConfirm = onConfirm
    const opts = (sel: HTMLSelectElement, defaultIdx: number) => {
      sel.replaceChildren(...buffers.map((b, i) => {
        const o = document.createElement('option'); o.value = b.id; o.textContent = b.title
        if (i === defaultIdx) o.selected = true
        return o
      }))
    }
    opts(this.leftSel, 0)
    opts(this.rightSel, 1)
    this.overlay.classList.remove('hidden')
    this.dialog.open({ panel: this.box, labelledBy: 'diff-picker-title', initialFocus: this.leftSel, requestClose: () => this.close() })
  }

  private confirm(): void {
    const l = this.leftSel.value, r = this.rightSel.value
    const onConfirm = this.onConfirm
    this.close()
    onConfirm?.(l, r)
  }
  private close(): void { this.overlay.classList.add('hidden'); this.dialog.close() }
}
