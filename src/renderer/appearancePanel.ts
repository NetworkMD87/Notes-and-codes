import { THEME_LIST, ACCENT_SWATCHES } from './themes'
import { pushOverlay } from './overlayManager'

export interface AppearanceDeps {
  currentThemeId: () => string
  currentAccent: () => string | null
  pickTheme: (id: string) => void
  setAccent: (accent: string | null) => void
  fontFamily: () => string
  setFontFamily: (name: string) => void
  fontLigatures: () => boolean
  setLigatures: (on: boolean) => void
  uiFontFamily: () => string
  setUiFontFamily: (name: string) => void
  fontSize: () => number
  setFontSize: (px: number) => void
  showAllFiles: () => boolean
  setShowAllFiles: (on: boolean) => void
  restoreFolder: () => boolean
  setRestoreFolder: (on: boolean) => void
  autoSaveToDisk: () => boolean
  setAutoSaveToDisk: (on: boolean) => void
  formatOnSave: () => boolean
  setFormatOnSave: (on: boolean) => void
}

const FONTS = ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Courier New']
const UI_FONTS = ['System', 'Segoe UI', 'system-ui', ...FONTS]

export class AppearancePanel {
  private host: HTMLElement
  private unreg?: () => void
  constructor(parent: HTMLElement, private d: AppearanceDeps) {
    this.host = document.createElement('div')
    this.host.className = 'appearance hidden'
    this.host.id = 'appearance'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(): void { this.render(); this.host.classList.remove('hidden'); this.unreg = pushOverlay(() => this.close()) }
  private close(): void { this.unreg?.(); this.unreg = undefined; this.host.classList.add('hidden') }

  private render(): void {
    const box = document.createElement('div'); box.className = 'appearance-box'

    const themeWrap = document.createElement('div')
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
    const famLabel = document.createElement('label'); famLabel.textContent = 'Editor font'
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

    const uiRow = document.createElement('div'); uiRow.className = 'appearance-row'
    const uiLabel = document.createElement('label'); uiLabel.textContent = 'Interface font'
    const uiSel = document.createElement('select')
    for (const f of [...UI_FONTS, 'Custom…']) { const o = document.createElement('option'); o.value = f; o.textContent = f; uiSel.appendChild(o) }
    const uiCustom = document.createElement('input'); uiCustom.type = 'text'; uiCustom.placeholder = 'Font name'
    const uiCur = this.d.uiFontFamily()
    if (UI_FONTS.includes(uiCur)) { uiSel.value = uiCur; uiCustom.style.display = 'none' } else { uiSel.value = 'Custom…'; uiCustom.value = uiCur }
    uiSel.onchange = () => {
      if (uiSel.value === 'Custom…') { uiCustom.style.display = ''; if (uiCustom.value) this.d.setUiFontFamily(uiCustom.value) }
      else { uiCustom.style.display = 'none'; this.d.setUiFontFamily(uiSel.value) }
    }
    uiCustom.onchange = () => { if (uiCustom.value) this.d.setUiFontFamily(uiCustom.value) }
    uiRow.append(uiLabel, uiSel, uiCustom)

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

    fontWrap.append(fh, famRow, uiRow, sizeRow, ligRow)

    const folderWrap = document.createElement('div')
    const foh = document.createElement('h3'); foh.textContent = 'Folder'
    const allRow = document.createElement('div'); allRow.className = 'appearance-row'
    const allLabel = document.createElement('label'); allLabel.textContent = 'Show all files (incl. node_modules / .git)'
    const all = document.createElement('input'); all.type = 'checkbox'; all.checked = this.d.showAllFiles()
    all.onchange = () => this.d.setShowAllFiles(all.checked)
    allRow.append(allLabel, all)
    const resRow = document.createElement('div'); resRow.className = 'appearance-row'
    const resLabel = document.createElement('label'); resLabel.textContent = 'Reopen last folder on launch'
    const res = document.createElement('input'); res.type = 'checkbox'; res.checked = this.d.restoreFolder()
    res.onchange = () => this.d.setRestoreFolder(res.checked)
    resRow.append(resLabel, res)
    folderWrap.append(foh, allRow, resRow)

    const editorWrap = document.createElement('div')
    const eh = document.createElement('h3'); eh.textContent = 'Editor'
    const asRow = document.createElement('div'); asRow.className = 'appearance-row'
    const asLabel = document.createElement('label'); asLabel.textContent = 'Auto-save changes to disk (named files)'
    const as = document.createElement('input'); as.type = 'checkbox'; as.checked = this.d.autoSaveToDisk()
    as.onchange = () => this.d.setAutoSaveToDisk(as.checked)
    asRow.append(asLabel, as)
    const fosRow = document.createElement('div'); fosRow.className = 'appearance-row'
    const fosLabel = document.createElement('label'); fosLabel.textContent = 'Format on save (named files)'
    const fos = document.createElement('input'); fos.type = 'checkbox'; fos.checked = this.d.formatOnSave()
    fos.onchange = () => this.d.setFormatOnSave(fos.checked)
    fosRow.append(fosLabel, fos)
    editorWrap.append(eh, asRow, fosRow)

    const left = document.createElement('div'); left.className = 'appearance-col-left'
    left.append(themeWrap, accWrap)
    const right = document.createElement('div'); right.className = 'appearance-col-right'
    right.append(fontWrap, editorWrap, folderWrap)
    box.append(left, right)
    this.host.replaceChildren(box)
  }
}
