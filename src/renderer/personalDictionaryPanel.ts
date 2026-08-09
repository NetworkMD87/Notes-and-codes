import type { SpellDictionaryResult } from '../shared/types'
import { DialogController } from './dialogController'

export interface PersonalDictionaryDeps {
  list: () => Promise<string[]>
  remove: (word: string) => Promise<SpellDictionaryResult>
  changed: (words: string[]) => void
  notify: (message: string, level: 'error') => void
}

const sortWords = (words: string[]): string[] => [...words].sort((a, b) => (
  a.localeCompare(b, 'en', { sensitivity: 'base' }) || a.localeCompare(b, 'en')
))

export class PersonalDictionaryPanel {
  private readonly overlay: HTMLDivElement
  private readonly box: HTMLDivElement
  private readonly listEl: HTMLDivElement
  private readonly closeButton: HTMLButtonElement
  private readonly dialog: DialogController
  private openEpoch = 0

  constructor(host: HTMLElement, private readonly deps: PersonalDictionaryDeps, focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div')
    this.overlay.className = 'personal-dictionary hidden'

    this.box = document.createElement('div'); this.box.className = 'personal-dictionary-box'
    const head = document.createElement('div'); head.className = 'personal-dictionary-head'
    const title = document.createElement('h2'); title.id = 'personal-dictionary-title'; title.textContent = 'Personal dictionary'
    this.closeButton = document.createElement('button'); this.closeButton.type = 'button'; this.closeButton.textContent = 'Close'; this.closeButton.setAttribute('aria-label', 'Close Personal dictionary'); this.closeButton.onclick = () => this.close()
    head.append(title, this.closeButton)

    this.listEl = document.createElement('div')
    this.listEl.className = 'personal-dictionary-list'
    this.box.append(head, this.listEl)
    this.overlay.appendChild(this.box)
    this.overlay.addEventListener('mousedown', event => {
      if (event.target === this.overlay) this.close()
    })
    host.appendChild(this.overlay)
  }

  async open(): Promise<void> {
    const epoch = ++this.openEpoch
    this.listEl.textContent = 'Loading…'
    this.listEl.classList.add('personal-dictionary-loading')
    this.overlay.classList.remove('hidden')
    this.dialog.open({ panel: this.box, labelledBy: 'personal-dictionary-title', initialFocus: this.closeButton, requestClose: () => this.close() })

    try {
      const words = await this.deps.list()
      if (epoch === this.openEpoch && !this.overlay.classList.contains('hidden')) this.render(words)
    } catch {
      if (epoch !== this.openEpoch || this.overlay.classList.contains('hidden')) return
      this.listEl.replaceChildren()
      this.listEl.classList.remove('personal-dictionary-loading')
      this.deps.notify('Could not load the personal dictionary.', 'error')
    }
  }

  private close(): void {
    this.openEpoch++
    this.overlay.classList.add('hidden')
    this.dialog.close()
  }

  private render(words: string[]): void {
    this.listEl.classList.remove('personal-dictionary-loading')
    const sorted = sortWords(words)
    const rows = sorted.map(word => {
      const row = document.createElement('div'); row.className = 'personal-word'
      const text = document.createElement('span'); text.className = 'personal-word-text'; text.textContent = word
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${word} from personal dictionary`)
      remove.onclick = () => void this.remove(word, remove)
      row.append(text, remove)
      return row
    })
    this.listEl.replaceChildren(...rows)
    if (sorted.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'personal-dictionary-empty'
      empty.textContent = 'No personal words yet.'
      this.listEl.appendChild(empty)
    }
  }

  private async remove(word: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true
    let result: SpellDictionaryResult
    try {
      result = await this.deps.remove(word)
    } catch {
      result = { ok: false, words: [] }
    }
    if (!result.ok) {
      button.disabled = false
      this.deps.notify('Could not remove that word from the personal dictionary.', 'error')
      return
    }
    this.render(result.words)
    this.deps.changed([...result.words])
  }
}
