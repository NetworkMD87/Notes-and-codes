import type { BufferState } from '../shared/types'

export interface TabHandlers {
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export class TabBar {
  constructor(private container: HTMLElement, private handlers: TabHandlers) {}

  render(buffers: BufferState[], activeId: string | null): void {
    this.container.replaceChildren()
    for (const b of buffers) {
      const tab = document.createElement('div')
      tab.className = 'tab' + (b.id === activeId ? ' active' : '')
      tab.dataset.id = b.id
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
}
