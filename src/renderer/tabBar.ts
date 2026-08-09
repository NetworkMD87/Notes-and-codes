import type { BufferState } from '../shared/types'
import { HL_HEX } from '../shared/types'
import { langBadge } from './fileType'
import { moveRovingIndex } from './rovingIndex'

export interface TabHandlers {
  onSelect: (id: string) => void
  onClose: (id: string) => void | Promise<void>
  onNew: () => void
  onReorder: (id: string, toIndex: number) => void
}

export class TabBar {
  private draggedId: string | null = null

  constructor(private container: HTMLElement, private handlers: TabHandlers) {
    this.container.setAttribute('role', 'tablist')
    this.container.setAttribute('aria-label', 'Open files')
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
      tab.setAttribute('role', 'presentation')
      tab.draggable = true

      const select = document.createElement('button')
      select.type = 'button'; select.className = 'tab-select'; select.id = `tab-${b.id}`
      select.dataset.id = b.id
      select.setAttribute('role', 'tab')
      select.setAttribute('aria-selected', String(b.id === activeId))
      select.setAttribute('aria-controls', 'panes')
      select.tabIndex = b.id === activeId ? 0 : -1
      const badge = document.createElement('span'); badge.className = 'badge'
      const lb = langBadge(b.language); badge.textContent = lb.label
      if (lb.colour) { const hex = HL_HEX[lb.colour]; badge.style.color = hex; badge.style.background = hex + '22' }
      else badge.style.color = 'var(--muted)'
      const title = document.createElement('span'); title.className = 'tab-title'
      title.textContent = (b.dirty ? '● ' : '') + b.title
      select.append(badge, title)
      select.onclick = () => this.handlers.onSelect(b.id)
      select.onkeydown = (event) => this.onTabKeydown(event, select)
      tab.onauxclick = (e) => { if (e.button === 1) this.handlers.onClose(b.id) } // middle-click

      const close = document.createElement('button')
      close.type = 'button'; close.textContent = '×'; close.className = 'tab-close'
      close.setAttribute('aria-label', `Close ${b.title}`)
      close.tabIndex = b.id === activeId ? 0 : -1
      close.onclick = (event) => {
        if (event.detail === 0) void this.closeFromKeyboard(b.id, buffers.findIndex(buffer => buffer.id === b.id))
        else void this.handlers.onClose(b.id)
      }
      tab.append(select, close)
      this.container.appendChild(tab)
    }
    const add = document.createElement('button')
    add.textContent = '+'; add.className = 'tab-add'
    add.onclick = () => this.handlers.onNew()
    this.container.appendChild(add)
  }

  focusTab(id: string): boolean {
    const tab = this.tabSelects().find(select => select.dataset.id === id)
    if (!tab) return false
    tab.focus()
    return true
  }

  private tabSelects(): HTMLButtonElement[] {
    return Array.from(this.container.querySelectorAll<HTMLButtonElement>('.tab-select[role="tab"]'))
  }

  private onTabKeydown(event: KeyboardEvent, current: HTMLButtonElement): void {
    const tabs = this.tabSelects()
    const next = moveRovingIndex(tabs.indexOf(current), tabs.map(() => true), event.key, 'horizontal')
    if (next === null) return
    event.preventDefault()
    const destination = tabs[next]
    const id = destination.dataset.id
    if (!id) return
    this.handlers.onSelect(id)
    queueMicrotask(() => this.focusTab(id))
  }

  private async closeFromKeyboard(id: string, oldIndex: number): Promise<void> {
    await this.handlers.onClose(id)
    if (this.tabEls().some(row => row.dataset.id === id)) return
    const selected = this.container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    const tabs = this.tabSelects()
    ;(selected ?? tabs[Math.min(oldIndex, tabs.length - 1)])?.focus()
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
