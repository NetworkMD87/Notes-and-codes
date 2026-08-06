import type { SpellDictionaryResult } from '../shared/types'
import { OverlayRegistration } from './overlayManager'

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
  private readonly listEl: HTMLDivElement
  private readonly reg = new OverlayRegistration()
  private openEpoch = 0

  constructor(host: HTMLElement, private readonly deps: PersonalDictionaryDeps) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'personal-dictionary hidden'

    const box = document.createElement('div'); box.className = 'personal-dictionary-box'
    const head = document.createElement('div'); head.className = 'personal-dictionary-head'
    const title = document.createElement('span'); title.textContent = 'Personal dictionary'
    const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => this.close()
    head.append(title, close)

    this.listEl = document.createElement('div')
    this.listEl.className = 'personal-dictionary-list'
    box.append(head, this.listEl)
    this.overlay.appendChild(box)
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
    this.overlay.tabIndex = -1
    this.overlay.focus()
    this.reg.open(() => this.close())

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
    this.reg.release()
    this.overlay.classList.add('hidden')
  }

  private render(words: string[]): void {
    this.listEl.classList.remove('personal-dictionary-loading')
    const sorted = sortWords(words)
    const rows = sorted.map(word => {
      const row = document.createElement('div'); row.className = 'personal-word'
      const text = document.createElement('span'); text.className = 'personal-word-text'; text.textContent = word
      const remove = document.createElement('button'); remove.textContent = 'Remove'
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
