import { rankCommands } from './commandSearch'
import { DialogController } from './dialogController'

export interface Command { id: string; label: string; run: () => void | Promise<void>; hint?: string }

export class CommandPalette {
  private commands: Command[] = []
  private overlay: HTMLDivElement
  private box: HTMLDivElement
  private input: HTMLInputElement
  private listEl: HTMLDivElement
  private countEl: HTMLDivElement
  private filtered: Command[] = []
  private cursor = 0
  private dialog: DialogController

  constructor(focusEditor: () => void) {
    this.dialog = new DialogController(focusEditor)
    this.overlay = document.createElement('div'); this.overlay.id = 'palette'; this.overlay.className = 'hidden'
    this.box = document.createElement('div'); this.box.className = 'palette-box'
    const title = document.createElement('h2'); title.id = 'palette-title'; title.className = 'sr-only'; title.textContent = 'Command Palette'
    this.input = document.createElement('input'); this.input.type = 'search'; this.input.placeholder = 'Type a command…'
    this.input.setAttribute('role', 'combobox'); this.input.setAttribute('aria-label', 'Command Palette')
    this.input.setAttribute('aria-autocomplete', 'list'); this.input.setAttribute('aria-controls', 'palette-list')
    this.input.setAttribute('aria-expanded', 'true')
    this.listEl = document.createElement('div'); this.listEl.id = 'palette-list'; this.listEl.className = 'palette-list'; this.listEl.setAttribute('role', 'listbox')
    this.countEl = document.createElement('div'); this.countEl.id = 'palette-count'; this.countEl.setAttribute('role', 'status'); this.countEl.setAttribute('aria-live', 'polite')
    this.box.append(title, this.input, this.listEl, this.countEl)
    this.overlay.append(this.box)
    document.body.appendChild(this.overlay)
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
  }

  register(cmd: Command): void { this.commands.push(cmd) }

  open(): void {
    this.overlay.classList.remove('hidden')
    this.input.setAttribute('aria-expanded', 'true')
    this.input.value = ''
    this.refresh()
    this.dialog.open({ panel: this.box, labelledBy: 'palette-title', initialFocus: this.input, requestClose: () => this.close() })
  }

  close(): void {
    this.overlay.classList.add('hidden')
    this.input.setAttribute('aria-expanded', 'false')
    this.dialog.close()
  }

  private refresh(): void {
    this.filtered = rankCommands(this.input.value, this.commands).map(result => result.command)
    this.cursor = 0
    this.listEl.replaceChildren(...this.filtered.map((command) => {
      const row = document.createElement('div')
      row.id = `palette-option-${command.id}`
      row.className = 'palette-row'
      row.setAttribute('role', 'option')
      const label = document.createElement('span'); label.textContent = command.label
      row.appendChild(label)
      if (command.hint) {
        const hint = document.createElement('span'); hint.className = 'palette-hint'
        for (const key of command.hint.split('+')) {
          const chip = document.createElement('span'); chip.className = 'kbd'; chip.textContent = key
          hint.appendChild(chip)
        }
        row.appendChild(hint)
      }
      row.onclick = () => this.exec(command)
      return row
    }))
    this.countEl.textContent = `${this.filtered.length} commands`
    this.paint()
  }

  private onKey(e: KeyboardEvent): void {
    // Escape is handled centrally by overlayManager (capture-phase, topmost-first).
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (this.filtered.length === 0) return
      this.cursor = Math.min(this.cursor + 1, this.filtered.length - 1)
      this.paint()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (this.filtered.length === 0) return
      this.cursor = Math.max(this.cursor - 1, 0)
      this.paint()
    } else if (e.key === 'Enter') {
      const command = this.filtered[this.cursor]
      if (command) { e.preventDefault(); this.exec(command) }
    }
  }

  private exec(command: Command): void {
    this.close()
    void Promise.resolve(command.run()).catch(error => console.error('command failed:', error))
  }

  private paint(): void {
    const active = this.filtered.length > 0 ? this.cursor : -1
    ;[...this.listEl.children].forEach((element, index) => {
      const selected = index === active
      element.classList.toggle('active', selected)
      element.setAttribute('aria-selected', String(selected))
      if (selected) {
        this.input.setAttribute('aria-activedescendant', element.id)
        element.scrollIntoView({ block: 'nearest' })
      }
    })
    if (active < 0) this.input.removeAttribute('aria-activedescendant')
  }
}
