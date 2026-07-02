import { HELP_SECTIONS, APP_TAGLINE, APP_LINKS, type HelpEntry } from './helpContent'
import { WORDMARK_SVG } from './brand'

export class HelpOverlay {
  private root: HTMLDivElement
  private box: HTMLDivElement
  private search: HTMLInputElement
  private body: HTMLDivElement
  private note: HTMLDivElement
  private descOn = false

  constructor() {
    this.root = document.createElement('div'); this.root.className = 'help-overlay hidden'
    this.box = document.createElement('div'); this.box.className = 'help-box'
    this.search = document.createElement('input'); this.search.type = 'text'
    this.search.placeholder = 'Search commands…'; this.search.className = 'help-search'
    this.note = document.createElement('div'); this.note.className = 'help-note'
    this.note.textContent = 'Not every command has a shortcut — run any from the Command Palette (Ctrl+Shift+P).'
    this.body = document.createElement('div'); this.body.className = 'help-body'
    this.box.append(this.search, this.body)
    this.root.appendChild(this.box)
    document.body.appendChild(this.root)
    this.search.addEventListener('input', () => this.filter())
    this.root.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close() })
  }

  openShortcuts(): void {
    this.box.replaceChildren(this.buildTitlebar('Shortcuts & Commands', this.buildDescToggle()), this.search, this.note, this.body)
    this.search.value = ''
    this.render()
    this.show()
    this.search.focus()
  }

  openAbout(): void {
    this.box.replaceChildren(this.buildTitlebar('About'))
    const card = document.createElement('div'); card.className = 'about-card'
    const logo = document.createElement('div'); logo.className = 'about-logo'; logo.innerHTML = WORDMARK_SVG
    const rule = document.createElement('div'); rule.className = 'about-rule'
    const ver = document.createElement('div'); ver.className = 'about-version'; ver.textContent = 'v…'
    window.api.getAppVersion()
      .then(v => { ver.textContent = 'v' + v })
      .catch(() => { ver.textContent = 'v—' })
    const tag = document.createElement('div'); tag.className = 'about-tagline'; tag.textContent = APP_TAGLINE
    const links = document.createElement('div'); links.className = 'about-links'
    for (const l of APP_LINKS) {
      const b = document.createElement('button'); b.className = 'about-link'; b.textContent = l.label
      b.onclick = () => { void window.api.openExternal(l.url) }
      links.appendChild(b)
    }
    card.append(logo, rule, ver, tag, links)
    this.box.appendChild(card)
    this.show()
  }

  private buildTitlebar(title: string, extra?: HTMLElement): HTMLDivElement {
    const bar = document.createElement('div'); bar.className = 'help-titlebar'
    const h = document.createElement('span'); h.className = 'help-title'; h.textContent = title
    bar.appendChild(h)
    if (extra) bar.appendChild(extra)
    bar.appendChild(this.buildClose())
    return bar
  }

  private buildDescToggle(): HTMLButtonElement {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'help-toggle'
    btn.textContent = 'Descriptions'; btn.title = 'Show a short explanation under each command'
    const sync = () => { btn.classList.toggle('on', this.descOn); btn.setAttribute('aria-pressed', String(this.descOn)) }
    btn.onclick = () => { this.descOn = !this.descOn; this.box.classList.toggle('desc-on', this.descOn); sync() }
    sync()
    return btn
  }

  private buildClose(): HTMLButtonElement {
    const btn = document.createElement('button'); btn.className = 'help-close'; btn.textContent = '✕'
    btn.title = 'Close'; btn.onclick = () => this.close(); return btn
  }

  private show(): void {
    this.root.classList.remove('hidden')
    this.root.tabIndex = -1
    this.root.focus()
  }
  private close(): void { this.root.classList.add('hidden') }

  private render(): void {
    this.body.replaceChildren()
    for (const cat of HELP_SECTIONS) {
      const group = document.createElement('div'); group.className = 'help-cat'; group.dataset.title = cat.title
      const title = document.createElement('div'); title.className = 'help-cat-title'; title.textContent = cat.title
      group.appendChild(title)
      for (const e of cat.entries) group.appendChild(this.row(e))
      this.body.appendChild(group)
    }
  }

  private row(e: HelpEntry): HTMLDivElement {
    const r = document.createElement('div'); r.className = 'help-row'
    const main = document.createElement('div'); main.className = 'help-main'
    const label = document.createElement('span'); label.className = 'help-label'; label.textContent = e.label
    main.appendChild(label)
    if (e.desc) {
      const d = document.createElement('div'); d.className = 'help-desc'; d.textContent = e.desc
      main.appendChild(d)
    }
    r.appendChild(main)
    if (e.keys) {
      const kbd = document.createElement('span'); kbd.className = 'help-kbd'; kbd.textContent = e.keys
      r.appendChild(kbd)
    }
    return r
  }

  private filter(): void {
    const q = this.search.value.trim().toLowerCase()
    let any = false
    for (const group of [...this.body.children] as HTMLDivElement[]) {
      if (!group.classList.contains('help-cat')) continue
      let matched = 0
      for (const row of [...group.children] as HTMLDivElement[]) {
        if (!row.classList.contains('help-row')) continue
        const label = row.querySelector('.help-label')?.textContent ?? ''
        const kbd = row.querySelector('.help-kbd')?.textContent ?? ''
        const desc = row.querySelector('.help-desc')?.textContent ?? ''
        const hit = !q || label.toLowerCase().includes(q) || kbd.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
        row.style.display = hit ? '' : 'none'
        if (hit) matched++
      }
      group.style.display = matched ? '' : 'none'
      if (matched) any = true
    }
    let empty = this.body.querySelector('.help-empty')
    if (!any) {
      if (!empty) {
        empty = document.createElement('div'); empty.className = 'help-empty'
        empty.textContent = 'No matching commands'
        this.body.appendChild(empty)
      }
    } else if (empty) {
      empty.remove()
    }
  }
}
