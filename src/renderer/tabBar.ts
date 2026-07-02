import type { BufferState } from '../shared/types'

export interface TabHandlers {
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
  onReorder: (id: string, toIndex: number) => void
}

export class TabBar {
  private draggedId: string | null = null

  constructor(private container: HTMLElement, private handlers: TabHandlers) {
    // Delegated on the container so the listeners survive render()'s replaceChildren().
    this.container.addEventListener('dragstart', (e) => this.onDragStart(e as DragEvent))
    this.container.addEventListener('dragover', (e) => this.onDragOver(e as DragEvent))
    this.container.addEventListener('drop', (e) => this.onDrop(e as DragEvent))
    this.container.addEventListener('dragend', () => this.onDragEnd())
  }

  render(buffers: BufferState[], activeId: string | null): void {
    this.container.replaceChildren()
    for (const b of buffers) {
      const tab = document.createElement('div')
      tab.className = 'tab' + (b.id === activeId ? ' active' : '')
      tab.dataset.id = b.id
      tab.draggable = true
      tab.textContent = (b.dirty ? '● ' : '') + b.title
      tab.onclick = (e) => { if ((e.target as HTMLElement).dataset.close !== '1') this.handlers.onSelect(b.id) }
      tab.onauxclick = (e) => { if (e.button === 1) this.handlers.onClose(b.id) } // middle-click
      const x = document.createElement('span')
      x.textContent = '×'; x.dataset.close = '1'; x.className = 'tab-close'
      x.onclick = () => this.handlers.onClose(b.id)
      tab.appendChild(x)
      this.container.appendChild(tab)
    }
    const add = document.createElement('button')
    add.textContent = '+'; add.className = 'tab-add'
    add.onclick = () => this.handlers.onNew()
    this.container.appendChild(add)
  }

  private tabEls(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll<HTMLElement>('.tab'))
  }

  // Final index among the NON-dragged tabs: how many of them sit left of the cursor.
  private indexFor(clientX: number): number {
    let i = 0
    for (const el of this.tabEls()) {
      if (el.dataset.id === this.draggedId) continue
      const r = el.getBoundingClientRect()
      if (clientX > r.left + r.width / 2) i++
    }
    return i
  }

  private clearMarks(): void {
    for (const el of this.tabEls()) el.classList.remove('drop-before', 'drop-after')
  }

  private showMark(clientX: number): void {
    this.clearMarks()
    const others = this.tabEls().filter(el => el.dataset.id !== this.draggedId)
    const i = this.indexFor(clientX)
    if (i < others.length) others[i].classList.add('drop-before')
    else others[others.length - 1]?.classList.add('drop-after')
  }

  private onDragStart(e: DragEvent): void {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab')
    if (!tab || !tab.dataset.id) return
    this.draggedId = tab.dataset.id
    tab.classList.add('dragging')
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', this.draggedId)
    }
  }

  private onDragOver(e: DragEvent): void {
    if (this.draggedId == null) return
    e.preventDefault() // required so 'drop' fires
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    this.showMark(e.clientX)
  }

  private onDrop(e: DragEvent): void {
    if (this.draggedId == null) return
    e.preventDefault()
    const id = this.draggedId
    const to = this.indexFor(e.clientX)
    this.onDragEnd()
    this.handlers.onReorder(id, to)
  }

  private onDragEnd(): void {
    this.container.querySelector('.tab.dragging')?.classList.remove('dragging')
    this.clearMarks()
    this.draggedId = null
  }
}
