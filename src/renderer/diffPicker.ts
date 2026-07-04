import type { BufferState } from '../shared/types'
import { pushOverlay } from './overlayManager'

export class DiffPicker {
  private overlay: HTMLDivElement
  private leftSel: HTMLSelectElement
  private rightSel: HTMLSelectElement
  private onConfirm: ((leftId: string, rightId: string) => void) | null = null
  private unreg?: () => void

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'diff-picker hidden'
    this.leftSel = document.createElement('select')
    this.rightSel = document.createElement('select')
    const compare = document.createElement('button')
    compare.textContent = 'Compare'
    compare.onclick = () => this.confirm()
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    cancel.onclick = () => this.close()
    const box = document.createElement('div')
    box.className = 'diff-picker-box'
    const lLbl = document.createElement('label'); lLbl.textContent = 'Left'
    const rLbl = document.createElement('label'); rLbl.textContent = 'Right'
    box.append(lLbl, this.leftSel, rLbl, this.rightSel, compare, cancel)
    this.overlay.appendChild(box)
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
    this.leftSel.focus()
    this.unreg = pushOverlay(() => this.close())
  }

  private confirm(): void {
    const l = this.leftSel.value, r = this.rightSel.value
    this.close()
    this.onConfirm?.(l, r)
  }
  private close(): void { this.unreg?.(); this.unreg = undefined; this.overlay.classList.add('hidden') }
}
