import { THEME_LIST, ACCENT_SWATCHES, swatchColours } from './themes'
import { pushOverlay } from './overlayManager'

export type SettingsCategory = 'appearance' | 'font' | 'editor' | 'folder' | 'startup' | 'integration'

export interface SettingsDeps {
  currentThemeId: () => string
  currentAccent: () => string | null
  pickTheme: (id: string) => void
  setAccent: (accent: string | null) => void
  previewTheme: (id: string) => void
  endPreview: () => void
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
  contextMenuEnabled: () => boolean
  /** Resolves once the registry write (and, on success, the settings persist) have
   *  settled — the boolean reports whether it succeeded. renderIntegration() uses the
   *  settle (not the boolean) as a cue to re-render, so a reverted value shows up in the
   *  checkbox even though it was set optimistically before the write resolved. */
  setContextMenu: (on: boolean) => Promise<boolean>
  openAtLogin: () => boolean
  setOpenAtLogin: (on: boolean) => void
}

const FONTS = ['JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Cascadia Code', 'Cascadia Mono', 'Consolas', 'Lucida Console', 'Courier New']
const UI_FONTS = ['System', 'Segoe UI', 'Calibri', 'Tahoma', 'Verdana', 'Arial', 'Georgia', 'system-ui', ...FONTS]

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'font', label: 'Font' },
  { id: 'editor', label: 'Editor' },
  { id: 'folder', label: 'Folder' },
  { id: 'startup', label: 'Startup' },
  { id: 'integration', label: 'Integration' },
]

export class SettingsPanel {
  private host: HTMLElement
  private unreg?: () => void
  private hoverTimer: number | undefined
  private active: SettingsCategory = 'appearance'

  constructor(parent: HTMLElement, private d: SettingsDeps) {
    this.host = document.createElement('div')
    this.host.className = 'settings hidden'
    this.host.id = 'settings'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(category: SettingsCategory = 'appearance'): void {
    this.active = category
    this.render()
    this.host.classList.remove('hidden')
    this.unreg = pushOverlay(() => this.close())
  }

  private close(): void {
    this.stopPreview()
    this.unreg?.(); this.unreg = undefined
    this.host.classList.add('hidden')
  }

  // Hover-intent delay: sweeping the cursor down 14 rows shouldn't re-theme Monaco 14 times.
  private schedulePreview(id: string): void {
    if (this.hoverTimer !== undefined) clearTimeout(this.hoverTimer)
    this.hoverTimer = window.setTimeout(() => { this.hoverTimer = undefined; this.d.previewTheme(id) }, 120)
  }

  // Cancel any pending preview and repaint the committed theme. Called from the grid's
  // mouseleave AND from close(). mouseleave does end up firing on most close paths too
  // (Chromium recomputes :hover when close() applies display:none, and again when the
  // pointer leaves the window) — but relying on that would make the revert depend on
  // Chromium's hover-recomputation timing relative to the hide. Calling stopPreview()
  // directly from close() makes the revert deterministic and ordered before the hide,
  // regardless of what mouseleave does or when.
  private stopPreview(): void {
    if (this.hoverTimer !== undefined) { clearTimeout(this.hoverTimer); this.hoverTimer = undefined }
    this.d.endPreview()
  }

  private row(labelText: string): { row: HTMLDivElement; label: HTMLLabelElement } {
    const row = document.createElement('div'); row.className = 'appearance-row'
    const label = document.createElement('label'); label.textContent = labelText
    row.appendChild(label)
    return { row, label }
  }

  private checkboxRow(labelText: string, checked: boolean, onChange: (on: boolean) => void): HTMLDivElement {
    const { row } = this.row(labelText)
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked
    cb.onchange = () => onChange(cb.checked)
    row.appendChild(cb)
    return row
  }

  private renderAppearance(): HTMLElement {
    const wrap = document.createElement('div')

    const th = document.createElement('h3'); th.textContent = 'Theme'
    const grid = document.createElement('div'); grid.className = 'appearance-themes'
    for (const t of THEME_LIST) {
      const row = document.createElement('div')
      row.className = 'appearance-theme' + (t.id === this.d.currentThemeId() ? ' active' : '')
      const label = document.createElement('span'); label.className = 'theme-label'; label.textContent = t.label
      // Decorative — the row's label already names the theme for a screen reader.
      const dots = document.createElement('div'); dots.className = 'theme-dots'; dots.setAttribute('aria-hidden', 'true')
      for (const c of swatchColours(t.id)) {
        const dot = document.createElement('span'); dot.className = 'theme-dot'; dot.style.background = c
        dots.appendChild(dot)
      }
      row.append(label, dots)
      row.onclick = () => { this.d.pickTheme(t.id); this.render() }
      row.onmouseenter = () => this.schedulePreview(t.id)
      grid.appendChild(row)
    }
    // on the GRID, not the row — row-to-row movement must not flash the committed theme
    grid.onmouseleave = () => this.stopPreview()

    // heading row: label + a live preview of the current accent + reset-to-default
    const head = document.createElement('div'); head.className = 'accent-head'
    const ah = document.createElement('h3'); ah.textContent = 'Accent'
    const preview = document.createElement('span'); preview.className = 'accent-current'
    preview.style.background = 'var(--accent)'; preview.title = 'Current accent'
    const reset = document.createElement('button'); reset.className = 'accent-default-btn'
    reset.textContent = 'Default'; reset.title = "Reset to the theme's own accent"
    if (this.d.currentAccent() === null) reset.classList.add('active')
    reset.onclick = () => { this.d.setAccent(null); this.render() }
    head.append(ah, preview, reset)
    const sw = document.createElement('div'); sw.className = 'appearance-sw'
    for (const s of ACCENT_SWATCHES) {
      const dot = document.createElement('div')
      dot.className = 'swatch' + (this.d.currentAccent() === s.value ? ' active' : '')
      dot.title = s.name; dot.style.background = s.value
      dot.onclick = () => { this.d.setAccent(s.value); this.render() }
      sw.appendChild(dot)
    }

    wrap.append(th, grid, head, sw)
    return wrap
  }

  private renderFont(): HTMLElement {
    const wrap = document.createElement('div')
    const fh = document.createElement('h3'); fh.textContent = 'Font'

    const { row: famRow } = this.row('Editor font')
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
    famRow.append(sel, custom)

    const { row: uiRow } = this.row('Interface font')
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
    uiRow.append(uiSel, uiCustom)

    const { row: sizeRow } = this.row('Size')
    const size = document.createElement('input'); size.type = 'number'; size.min = '6'; size.max = '40'; size.value = String(this.d.fontSize())
    size.onchange = () => { const n = parseInt(size.value, 10); if (!Number.isNaN(n)) this.d.setFontSize(n) }
    sizeRow.appendChild(size)

    const ligRow = this.checkboxRow('Ligatures', this.d.fontLigatures(), (on) => this.d.setLigatures(on))

    wrap.append(fh, famRow, uiRow, sizeRow, ligRow)
    return wrap
  }

  private renderEditor(): HTMLElement {
    const wrap = document.createElement('div')
    const eh = document.createElement('h3'); eh.textContent = 'Editor'
    wrap.append(
      eh,
      this.checkboxRow('Auto-save changes to disk (named files)', this.d.autoSaveToDisk(), (on) => this.d.setAutoSaveToDisk(on)),
      this.checkboxRow('Format on save (named files)', this.d.formatOnSave(), (on) => this.d.setFormatOnSave(on)),
    )
    return wrap
  }

  private renderFolder(): HTMLElement {
    const wrap = document.createElement('div')
    const foh = document.createElement('h3'); foh.textContent = 'Folder'
    wrap.append(
      foh,
      this.checkboxRow('Show all files (incl. node_modules / .git)', this.d.showAllFiles(), (on) => this.d.setShowAllFiles(on)),
      this.checkboxRow('Reopen last folder on launch', this.d.restoreFolder(), (on) => this.d.setRestoreFolder(on)),
    )
    return wrap
  }

  private renderStartup(): HTMLElement {
    const wrap = document.createElement('div')
    const sh = document.createElement('h3'); sh.textContent = 'Startup'
    wrap.append(
      sh,
      this.checkboxRow('Launch when Windows starts (opens hidden in the tray)',
        this.d.openAtLogin(), (on) => this.d.setOpenAtLogin(on)),
    )
    return wrap
  }

  private renderIntegration(): HTMLElement {
    const wrap = document.createElement('div')
    const ih = document.createElement('h3'); ih.textContent = 'Integration'
    wrap.append(
      ih,
      this.checkboxRow('Open with Notes & Codes — Windows right-click menu',
        this.d.contextMenuEnabled(),
        // Re-render once the write settles so a failure's revert (setContextMenuEnabled
        // flips contextMenuEnabled back and toasts) is reflected here — the checkbox was
        // already flipped optimistically by the browser's own native click behaviour.
        (on) => { void this.d.setContextMenu(on).then(() => this.render()) }),
    )
    return wrap
  }

  private renderDetail(): HTMLElement {
    switch (this.active) {
      case 'font': return this.renderFont()
      case 'editor': return this.renderEditor()
      case 'folder': return this.renderFolder()
      case 'startup': return this.renderStartup()
      case 'integration': return this.renderIntegration()
      default: return this.renderAppearance()
    }
  }

  private render(): void {
    const box = document.createElement('div'); box.className = 'settings-box'

    const nav = document.createElement('div'); nav.className = 'settings-nav'
    for (const c of CATEGORIES) {
      const row = document.createElement('div')
      row.className = 'settings-cat' + (c.id === this.active ? ' active' : '')
      row.textContent = c.label
      row.onclick = () => { this.active = c.id; this.render() }
      nav.appendChild(row)
    }

    const detail = document.createElement('div'); detail.className = 'settings-detail'
    detail.appendChild(this.renderDetail())

    box.append(nav, detail)
    this.host.replaceChildren(box)
  }
}
