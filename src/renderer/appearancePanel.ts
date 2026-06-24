import { THEME_LIST, ACCENT_SWATCHES } from './themes'

export interface AppearanceDeps {
  currentThemeId: () => string
  currentAccent: () => string | null
  pickTheme: (id: string) => void
  setAccent: (accent: string | null) => void
  fontFamily: () => string
  setFontFamily: (name: string) => void
  fontLigatures: () => boolean
  setLigatures: (on: boolean) => void
  fontSize: () => number
  setFontSize: (px: number) => void
}

const FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Courier New']

export class AppearancePanel {
  private host: HTMLElement
  constructor(parent: HTMLElement, private d: AppearanceDeps) {
    this.host = document.createElement('div')
    this.host.className = 'appearance hidden'
    this.host.id = 'appearance'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(): void { this.render(); this.host.classList.remove('hidden') }
  private close(): void { this.host.classList.add('hidden') }

  private render(): void {
    const box = document.createElement('div'); box.className = 'appearance-box'

    const themeWrap = document.createElement('div'); themeWrap.className = 'appearance'
    const th = document.createElement('h3'); th.textContent = 'Theme'
    const grid = document.createElement('div'); grid.className = 'appearance-themes'
    for (const t of THEME_LIST) {
      const row = document.createElement('div')
      row.className = 'appearance-theme' + (t.id === this.d.currentThemeId() ? ' active' : '')
      row.textContent = t.label
      row.onclick = () => { this.d.pickTheme(t.id); this.render() }
      grid.appendChild(row)
    }
    themeWrap.append(th, grid)

    const accWrap = document.createElement('div')
    const ah = document.createElement('h3'); ah.textContent = 'Accent'
    const sw = document.createElement('div'); sw.className = 'appearance-sw'
    const def = document.createElement('div')
    def.className = 'swatch' + (this.d.currentAccent() === null ? ' active' : '')
    def.title = 'Theme default'; def.style.background = 'var(--accent)'; def.style.borderStyle = 'dashed'
    def.onclick = () => { this.d.setAccent(null); this.render() }
    sw.appendChild(def)
    for (const s of ACCENT_SWATCHES) {
      const dot = document.createElement('div')
      dot.className = 'swatch' + (this.d.currentAccent() === s.value ? ' active' : '')
      dot.title = s.name; dot.style.background = s.value
      dot.onclick = () => { this.d.setAccent(s.value); this.render() }
      sw.appendChild(dot)
    }
    accWrap.append(ah, sw)

    const fontWrap = document.createElement('div')
    const fh = document.createElement('h3'); fh.textContent = 'Font'
    const famRow = document.createElement('div'); famRow.className = 'appearance-row'
    const famLabel = document.createElement('label'); famLabel.textContent = 'Family'
    const sel = document.createElement('select')
    for (const f of [...FONTS, 'Custom…']) { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o) }
    const custom = document.createElement('input'); custom.type = 'text'; custom.placeholder = 'Font name'
    const cur = this.d.fontFamily()
    if (FONTS.includes(cur)) { sel.value = cur; custom.style.display = 'none' } else { sel.value = 'Custom…'; custom.value = cur }
    sel.onchange = () => {
      if (sel.value === 'Custom…') { custom.style.display = ''; if (custom.value) this.d.setFontFamily(custom.value) }
      else { custom.style.display = 'none'; this.d.setFontFamily(sel.value) }
    }
    custom.onchange = () => { if (custom.value) this.d.setFontFamily(custom.value) }
    famRow.append(famLabel, sel, custom)

    const sizeRow = document.createElement('div'); sizeRow.className = 'appearance-row'
    const sizeLabel = document.createElement('label'); sizeLabel.textContent = 'Size'
    const size = document.createElement('input'); size.type = 'number'; size.min = '6'; size.max = '40'; size.value = String(this.d.fontSize())
    size.onchange = () => { const n = parseInt(size.value, 10); if (!Number.isNaN(n)) this.d.setFontSize(n) }
    sizeRow.append(sizeLabel, size)

    const ligRow = document.createElement('div'); ligRow.className = 'appearance-row'
    const ligLabel = document.createElement('label'); ligLabel.textContent = 'Ligatures'
    const lig = document.createElement('input'); lig.type = 'checkbox'; lig.checked = this.d.fontLigatures()
    lig.onchange = () => this.d.setLigatures(lig.checked)
    ligRow.append(ligLabel, lig)

    fontWrap.append(fh, famRow, sizeRow, ligRow)
    box.append(themeWrap, accWrap, fontWrap)
    this.host.replaceChildren(box)
  }
}
