import type { BufferState, TabSizing } from '../shared/types'
import { HL_HEX } from '../shared/types'
import { langBadge } from './fileType'
import { moveRovingIndex } from './rovingIndex'
import { tabFolderLabels, tabFolderPrefix } from './tabLabels'

export interface TabHandlers {
  onSelect: (id: string) => void
  onClose: (id: string) => void | Promise<void>
  onNew: () => void
  onReorder: (id: string, toIndex: number) => void
}

export class TabBar {
  private draggedId: string | null = null
  private tabs = new Map<string, { tab: HTMLElement; select: HTMLButtonElement; close: HTMLButtonElement; title: HTMLElement; folder: HTMLElement; folderPrefix: HTMLElement; folderKey: HTMLElement; folderRest: HTMLElement; badge: HTMLElement; language: string }>()
  private folderLabels = new Map<string, string>()
  private folderPrefixes = new Map<string, string>()

  constructor(private container: HTMLElement, private handlers: TabHandlers) {
    this.setSizing('bounded')
    this.container.setAttribute('role', 'tablist')
    this.container.setAttribute('aria-label', 'Open files')
    // Delegated on the container so the listeners survive render()'s replaceChildren().
    this.container.addEventListener('dragstart', (e) => this.onDragStart(e as DragEvent))
    this.container.addEventListener('dragover', (e) => this.onDragOver(e as DragEvent))
    this.container.addEventListener('drop', (e) => this.onDrop(e as DragEvent))
    this.container.addEventListener('dragend', () => this.onDragEnd())
  }

  setSizing(mode: TabSizing): void {
    this.container.dataset.tabSizing = mode
  }

  render(buffers: BufferState[], activeId: string | null): void {
    this.folderLabels = tabFolderLabels(buffers)
    this.folderPrefixes = new Map([...this.folderLabels].map(([id, label]) => [id, tabFolderPrefix(label, this.folderLabels.values())]))
    const ids = [...this.tabs.keys()]
    if (buffers.length > 0 && ids.length === buffers.length && buffers.every((b, i) => b.id === ids[i])) {
      for (const b of buffers) {
        this.updateTab(b)
        const { tab, select, close } = this.tabs.get(b.id)!
        const active = b.id === activeId
        tab.classList.toggle('active', active)
        select.setAttribute('aria-selected', String(active))
        select.tabIndex = close.tabIndex = active ? 0 : -1
      }
      return
    }
    this.tabs.clear()
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
      const folder = document.createElement('span'); folder.className = 'tab-folder'
      folder.setAttribute('aria-hidden', 'true')
      const folderText = document.createElement('span'); folderText.className = 'tab-folder-text'
      const folderPrefix = document.createElement('span'); folderPrefix.className = 'tab-folder-prefix'
      const folderSuffix = document.createElement('span'); folderSuffix.className = 'tab-folder-suffix'
      const folderKey = document.createElement('span'); folderKey.className = 'tab-folder-key'
      const folderRest = document.createElement('span'); folderRest.className = 'tab-folder-rest'
      folderSuffix.append(folderKey, folderRest)
      folderText.append(folderPrefix, folderSuffix); folder.append(folderText)
      const label = document.createElement('span'); label.className = 'tab-label'
      label.append(title, folder)
      select.append(badge, label)
      select.onclick = () => this.handlers.onSelect(b.id)
      select.onkeydown = (event) => this.onTabKeydown(event, select)
      tab.onauxclick = (e) => { if (e.button === 1) this.handlers.onClose(b.id) } // middle-click

      const close = document.createElement('button')
      close.type = 'button'; close.textContent = '×'; close.className = 'tab-close'
      close.tabIndex = b.id === activeId ? 0 : -1
      close.onclick = (event) => {
        if (event.detail === 0) void this.closeFromKeyboard(b.id, buffers.findIndex(buffer => buffer.id === b.id))
        else void this.handlers.onClose(b.id)
      }
      tab.append(select, close)
      this.tabs.set(b.id, { tab, select, close, title, folder, folderPrefix, folderKey, folderRest, badge, language: b.language })
      this.updateTab(b)
      this.container.appendChild(tab)
    }
    const add = document.createElement('button')
    add.textContent = '+'; add.className = 'tab-add'
    add.onclick = () => this.handlers.onNew()
    this.container.appendChild(add)
  }

  /** Content edits touch only their tab; repeated edits of a dirty tab do no DOM work. */
  updateTab(buffer: BufferState): void {
    const entry = this.tabs.get(buffer.id)
    if (!entry) return
    const title = (buffer.dirty ? '● ' : '') + buffer.title
    if (entry.title.textContent !== title) entry.title.textContent = title
    const folder = this.folderLabels.get(buffer.id) ?? ''
    const prefix = this.folderPrefixes.get(buffer.id) ?? ''
    const suffix = folder.slice(prefix.length)
    const key = [...suffix][0] ?? ''
    const rest = suffix.slice(key.length)
    if (entry.folderPrefix.textContent !== prefix) entry.folderPrefix.textContent = prefix
    if (entry.folderKey.textContent !== key) entry.folderKey.textContent = key
    if (entry.folderRest.textContent !== rest) entry.folderRest.textContent = rest
    if (entry.folder.hidden !== !folder) entry.folder.hidden = !folder
    const identity = buffer.filePath ? `${buffer.title}, ${buffer.filePath}` : buffer.title
    const tooltip = (buffer.filePath ?? buffer.title) + (buffer.dirty ? '\nUnsaved changes' : '')
    const accessible = identity + (buffer.dirty ? ', Unsaved changes' : '')
    if (entry.select.title !== tooltip) entry.select.title = tooltip
    if (entry.select.getAttribute('aria-label') !== accessible) entry.select.setAttribute('aria-label', accessible)
    if (entry.close.getAttribute('aria-label') !== `Close ${identity}`) entry.close.setAttribute('aria-label', `Close ${identity}`)
    if (entry.language !== buffer.language) {
      entry.language = buffer.language
      const badge = langBadge(buffer.language)
      entry.badge.textContent = badge.label
      entry.badge.style.color = badge.colour ? HL_HEX[badge.colour] : 'var(--muted)'
      entry.badge.style.background = badge.colour ? HL_HEX[badge.colour] + '22' : ''
    }
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
    queueMicrotask(() => {
      if (document.activeElement === document.body || document.activeElement === current) this.focusTab(id)
    })
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
