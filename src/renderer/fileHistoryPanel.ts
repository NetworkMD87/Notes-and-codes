import type { FileVersion } from '../shared/types'
import { pushOverlay } from './overlayManager'

export interface FileHistoryDeps {
  current: () => { path: string; title: string; content: string; language: string } | null
  openDiff: (version: FileVersion, current: { title: string; content: string; language: string }) => void
  restore: (version: FileVersion) => void
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h} hr ago`
  const d = Math.floor(h / 24); return `${d} day${d === 1 ? '' : 's'} ago`
}

export class FileHistoryPanel {
  private host: HTMLElement
  private unreg?: () => void
  constructor(parent: HTMLElement, private d: FileHistoryDeps) {
    this.host = document.createElement('div')
    this.host.className = 'file-history hidden'; this.host.id = 'file-history'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  async open(): Promise<void> {
    const cur = this.d.current()
    const box = document.createElement('div'); box.className = 'fh-box'
    const h = document.createElement('h3'); h.textContent = 'File History'; box.appendChild(h)

    if (!cur) {
      const empty = document.createElement('div'); empty.className = 'fh-empty'
      empty.textContent = 'Save this file first to start its history.'
      box.appendChild(empty)
    } else {
      const list = await window.api.listHistory(cur.path)
      if (!list.length) {
        const empty = document.createElement('div'); empty.className = 'fh-empty'
        empty.textContent = 'No versions yet — save or wait for an auto-snapshot.'
        box.appendChild(empty)
      } else {
        const ul = document.createElement('div'); ul.className = 'fh-list'
        for (const { ts } of list) {
          const row = document.createElement('div'); row.className = 'fh-row'
          const when = document.createElement('span'); when.className = 'fh-when'
          when.textContent = relativeTime(ts); when.title = new Date(ts).toLocaleString()
          const diffBtn = document.createElement('button'); diffBtn.textContent = 'Diff'
          diffBtn.onclick = async () => {
            const v = await window.api.getHistory(cur.path, ts); if (v) { this.d.openDiff(v, cur); this.close() }
          }
          const restoreBtn = document.createElement('button'); restoreBtn.textContent = 'Restore'
          restoreBtn.onclick = async () => {
            const v = await window.api.getHistory(cur.path, ts); if (v) { this.d.restore(v); this.close() }
          }
          row.append(when, diffBtn, restoreBtn); ul.appendChild(row)
        }
        box.appendChild(ul)
      }
    }
    this.host.replaceChildren(box); this.host.classList.remove('hidden')
    this.unreg = pushOverlay(() => this.close())
  }

  private close(): void { this.unreg?.(); this.unreg = undefined; this.host.classList.add('hidden') }
}
