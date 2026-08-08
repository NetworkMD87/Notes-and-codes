import type { FileVersion } from '../shared/types'
import { DialogController } from './dialogController'
import { emptyState, EMPTY_ICONS } from './emptyState'

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
  private readonly host: HTMLDivElement
  private readonly box: HTMLDivElement
  private readonly body: HTMLDivElement
  private readonly closeButton: HTMLButtonElement
  private readonly dialog: DialogController
  private openEpoch = 0

  constructor(parent: HTMLElement, private readonly d: FileHistoryDeps, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.host = document.createElement('div')
    this.host.className = 'file-history hidden'; this.host.id = 'file-history'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    this.box = document.createElement('div'); this.box.className = 'fh-box'
    const heading = document.createElement('h2'); heading.id = 'file-history-title'; heading.textContent = 'File History'
    this.closeButton = document.createElement('button'); this.closeButton.type = 'button'; this.closeButton.className = 'fh-close'; this.closeButton.textContent = 'Close'; this.closeButton.setAttribute('aria-label', 'Close File History'); this.closeButton.onclick = () => this.close()
    this.body = document.createElement('div'); this.body.className = 'fh-body'
    this.box.append(heading, this.closeButton, this.body)
    this.host.appendChild(this.box)
    parent.appendChild(this.host)
  }

  async open(): Promise<void> {
    const cur = this.d.current()
    const epoch = ++this.openEpoch
    this.body.textContent = 'Loading history…'
    this.host.classList.remove('hidden')
    this.dialog.open({ panel: this.box, labelledBy: 'file-history-title', initialFocus: this.closeButton, requestClose: () => this.close() })
    const list = cur ? await window.api.listHistory(cur.path) : []
    if (epoch !== this.openEpoch || this.host.classList.contains('hidden')) return
    this.renderHistory(cur, list)
  }

  private close(): void {
    this.openEpoch++
    this.host.classList.add('hidden')
    this.dialog.close()
  }

  private renderHistory(cur: ReturnType<FileHistoryDeps['current']>, list: Pick<FileVersion, 'ts'>[]): void {
    this.body.replaceChildren()
    if (!cur) {
      this.body.appendChild(emptyState('fh-empty', EMPTY_ICONS.history, 'Save this file first to start its history.'))
      return
    }
    if (!list.length) {
      this.body.appendChild(emptyState('fh-empty', EMPTY_ICONS.history, 'No versions yet — save or wait for an auto-snapshot.'))
      return
    }
    const ul = document.createElement('div'); ul.className = 'fh-list'
    for (const { ts } of list) {
      const row = document.createElement('div'); row.className = 'fh-row'
      const when = document.createElement('span'); when.className = 'fh-when'
      const relative = relativeTime(ts)
      when.textContent = relative; when.title = new Date(ts).toLocaleString()
      const diffBtn = document.createElement('button'); diffBtn.type = 'button'; diffBtn.textContent = 'Diff'; diffBtn.setAttribute('aria-label', `Diff version from ${relative}`)
      diffBtn.onclick = async () => {
        const v = await window.api.getHistory(cur.path, ts)
        if (v) { this.close(); this.d.openDiff(v, cur) }
      }
      const restoreBtn = document.createElement('button'); restoreBtn.type = 'button'; restoreBtn.textContent = 'Restore'; restoreBtn.setAttribute('aria-label', `Restore version from ${relative}`)
      restoreBtn.onclick = async () => {
        const v = await window.api.getHistory(cur.path, ts)
        if (v) { this.close(); this.d.restore(v) }
      }
      row.append(when, diffBtn, restoreBtn); ul.appendChild(row)
    }
    this.body.appendChild(ul)
  }
}
