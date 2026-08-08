import { THEME_LIST, ACCENT_SWATCHES, swatchColours } from './themes'
import { DialogController } from './dialogController'
import { accelFromEvent, formatAccel } from '../shared/accelerator'
import { moveRovingIndex } from './rovingIndex'
import type { ResolvedSpellLocale, SpellCheckLanguage } from '../shared/spell'

export type SettingsCategory = 'appearance' | 'font' | 'editor' | 'folder' | 'startup' | 'integration'

export interface SettingsDeps {
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
  spellCheckEnabled: () => boolean
  setSpellCheckEnabled: (enabled: boolean) => Promise<void>
  spellCheckLanguage: () => SpellCheckLanguage
  setSpellCheckLanguage: (language: SpellCheckLanguage) => Promise<void>
  resolvedSpellLocale: () => ResolvedSpellLocale
  openPersonalDictionary: () => void
  contextMenuEnabled: () => boolean
  setContextMenu: (on: boolean) => Promise<boolean>
  openAtLogin: () => boolean
  setOpenAtLogin: (on: boolean) => void
  globalHotkey: () => string
  setGlobalHotkey: (accel: string) => Promise<boolean>
  focusEditor: () => void
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
  private readonly host: HTMLElement
  private readonly box: HTMLElement
  private readonly nav: HTMLElement
  private readonly detail: HTMLElement
  private readonly dialog: DialogController
  private active: SettingsCategory = 'appearance'
  private recording = false
  private keyHandler?: (e: KeyboardEvent) => void
  private controlId = 0

  constructor(parent: HTMLElement, private d: SettingsDeps) {
    this.host = document.createElement('div')
    this.host.className = 'settings hidden'
    this.host.id = 'settings'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.requestClose() })

    this.box = document.createElement('section'); this.box.className = 'settings-box'
    const heading = document.createElement('h2'); heading.id = 'settings-title'; heading.className = 'sr-only'; heading.textContent = 'Settings'
    const close = document.createElement('button'); close.id = 'settings-close'; close.className = 'settings-close'
    close.type = 'button'; close.setAttribute('aria-label', 'Close Settings'); close.textContent = '✕'
    close.onclick = () => this.requestClose()
    this.nav = document.createElement('div'); this.nav.className = 'settings-nav'; this.nav.setAttribute('role', 'tablist')
    this.nav.setAttribute('aria-orientation', 'vertical'); this.nav.setAttribute('aria-label', 'Settings categories')
    this.detail = document.createElement('div'); this.detail.className = 'settings-detail'
    this.box.append(heading, close, this.nav, this.detail); this.host.appendChild(this.box)
    parent.appendChild(this.host)
    this.dialog = new DialogController(this.d.focusEditor)
  }

  open(category: SettingsCategory = 'appearance'): void {
    this.stopRecording()
    this.active = category
    this.render()
    this.host.classList.remove('hidden')
    this.dialog.open({
      panel: this.box,
      labelledBy: 'settings-title',
      initialFocus: this.nav.querySelector<HTMLElement>(`#settings-tab-${this.active}`),
      requestClose: () => this.requestClose(),
    })
  }

  private requestClose(): void {
    // Escape while recording cancels only the recorder. Keeping the dialog registration live
    // means the next Escape closes the same Settings session and restores its original opener.
    if (this.recording) { this.cancelRecording(); return }
    this.host.classList.add('hidden')
    this.dialog.close()
  }

  private stopRecording(): void {
    this.recording = false
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = undefined }
  }

  private cancelRecording(): void {
    this.stopRecording()
    this.render('hotkey-record')
  }

  windowLostFocus(): void {
    if (this.recording) this.cancelRecording()
  }

  private startRecording(): void {
    this.recording = true
    this.keyHandler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.code === 'Escape') { this.cancelRecording(); return }
      const r = accelFromEvent(e)
      if (!r.ok) return
      const accel = r.accel
      this.stopRecording()
      void this.d.setGlobalHotkey(accel).then(() => this.render('hotkey-record'))
    }
    window.addEventListener('keydown', this.keyHandler, true)
    this.render('hotkey-record')
  }

  private labelledRow(labelText: string, control: HTMLInputElement | HTMLSelectElement): HTMLDivElement {
    const row = document.createElement('div'); row.className = 'appearance-row'
    const label = document.createElement('label'); const id = `setting-${this.controlId++}`
    control.id = id; label.htmlFor = id; label.textContent = labelText
    row.append(label, control); return row
  }

  private checkboxRow(labelText: string, checked: boolean, onChange: (on: boolean) => void, focusKey?: string): HTMLDivElement {
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked
    if (focusKey) cb.dataset.settingsFocus = focusKey
    cb.onchange = () => onChange(cb.checked)
    return this.labelledRow(labelText, cb)
  }

  private customFontControl(labelText: string, input: HTMLInputElement): HTMLLabelElement {
    const label = document.createElement('label')
    const id = `setting-${this.controlId++}`
    input.id = id; label.htmlFor = id; label.className = 'sr-only'; label.textContent = labelText
    return label
  }

  private renderAppearance(): HTMLElement {
    const wrap = document.createElement('div')
    const th = document.createElement('h3'); th.id = 'settings-theme-heading'; th.textContent = 'Theme'
    const grid = document.createElement('div'); grid.className = 'appearance-themes'
    grid.setAttribute('role', 'radiogroup'); grid.setAttribute('aria-labelledby', th.id)
    for (const t of THEME_LIST) {
      const row = document.createElement('button')
      row.type = 'button'; row.className = 'appearance-theme' + (t.id === this.d.currentThemeId() ? ' active' : '')
      row.setAttribute('role', 'radio'); row.setAttribute('aria-checked', String(t.id === this.d.currentThemeId()))
      row.tabIndex = t.id === this.d.currentThemeId() ? 0 : -1
      const label = document.createElement('span'); label.className = 'theme-label'; label.textContent = t.label
      const dots = document.createElement('div'); dots.className = 'theme-dots'; dots.setAttribute('aria-hidden', 'true')
      for (const c of swatchColours(t.id)) {
        const dot = document.createElement('span'); dot.className = 'theme-dot'; dot.style.background = c
        dots.appendChild(dot)
      }
      row.append(label, dots)
      row.dataset.settingsFocus = `theme-${t.id}`
      row.onclick = () => { this.d.pickTheme(t.id); this.render(`theme-${t.id}`) }
      row.onkeydown = event => {
        const radios = [...grid.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
        const next = moveRovingIndex(radios.indexOf(row), radios.map(() => true), event.key, 'horizontal')
        if (next === null) return
        event.preventDefault()
        const theme = THEME_LIST[next]
        this.d.pickTheme(theme.id)
        this.render(`theme-${theme.id}`)
      }
      grid.appendChild(row)
    }

    const head = document.createElement('div'); head.className = 'accent-head'
    const ah = document.createElement('h3'); ah.textContent = 'Accent'
    const preview = document.createElement('span'); preview.className = 'accent-current'
    preview.style.background = 'var(--accent)'; preview.title = 'Current accent'; preview.setAttribute('aria-hidden', 'true')
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'accent-default-btn'
    reset.textContent = 'Default'; reset.title = "Reset to the theme's own accent"
    reset.setAttribute('aria-label', 'Use theme default accent')
    reset.setAttribute('aria-pressed', String(this.d.currentAccent() === null))
    if (this.d.currentAccent() === null) reset.classList.add('active')
    reset.dataset.settingsFocus = 'accent-default'
    reset.onclick = () => { this.d.setAccent(null); this.render('accent-default') }
    head.append(ah, preview, reset)
    const sw = document.createElement('div'); sw.className = 'appearance-sw'
    for (const s of ACCENT_SWATCHES) {
      const dot = document.createElement('button')
      dot.type = 'button'; dot.className = 'swatch' + (this.d.currentAccent() === s.value ? ' active' : '')
      dot.title = s.name; dot.style.background = s.value
      dot.setAttribute('aria-label', `Accent ${s.name}`)
      dot.setAttribute('aria-pressed', String(this.d.currentAccent() === s.value))
      dot.dataset.settingsFocus = `accent-${s.name}`
      dot.onclick = () => { this.d.setAccent(s.value); this.render(`accent-${s.name}`) }
      sw.appendChild(dot)
    }
    wrap.append(th, grid, head, sw)
    return wrap
  }

  private renderFont(): HTMLElement {
    const wrap = document.createElement('div')
    const fh = document.createElement('h3'); fh.textContent = 'Font'

    const sel = document.createElement('select')
    for (const f of [...FONTS, 'Custom…']) { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o) }
    const custom = document.createElement('input'); custom.type = 'text'; custom.placeholder = 'Font name'
    const famRow = this.labelledRow('Editor font', sel)
    famRow.append(this.customFontControl('Custom editor font', custom), custom)
    const cur = this.d.fontFamily()
    if (FONTS.includes(cur)) { sel.value = cur; custom.style.display = 'none' } else { sel.value = 'Custom…'; custom.value = cur }
    sel.onchange = () => {
      if (sel.value === 'Custom…') { custom.style.display = ''; if (custom.value) this.d.setFontFamily(custom.value) }
      else { custom.style.display = 'none'; this.d.setFontFamily(sel.value) }
    }
    custom.onchange = () => { if (custom.value) this.d.setFontFamily(custom.value) }

    const uiSel = document.createElement('select')
    for (const f of [...UI_FONTS, 'Custom…']) { const o = document.createElement('option'); o.value = f; o.textContent = f; uiSel.appendChild(o) }
    const uiCustom = document.createElement('input'); uiCustom.type = 'text'; uiCustom.placeholder = 'Font name'
    const uiRow = this.labelledRow('Interface font', uiSel)
    uiRow.append(this.customFontControl('Custom interface font', uiCustom), uiCustom)
    const uiCur = this.d.uiFontFamily()
    if (UI_FONTS.includes(uiCur)) { uiSel.value = uiCur; uiCustom.style.display = 'none' } else { uiSel.value = 'Custom…'; uiCustom.value = uiCur }
    uiSel.onchange = () => {
      if (uiSel.value === 'Custom…') { uiCustom.style.display = ''; if (uiCustom.value) this.d.setUiFontFamily(uiCustom.value) }
      else { uiCustom.style.display = 'none'; this.d.setUiFontFamily(uiSel.value) }
    }
    uiCustom.onchange = () => { if (uiCustom.value) this.d.setUiFontFamily(uiCustom.value) }

    const size = document.createElement('input'); size.type = 'number'; size.min = '6'; size.max = '40'; size.value = String(this.d.fontSize())
    size.onchange = () => { const n = parseInt(size.value, 10); if (!Number.isNaN(n)) this.d.setFontSize(n) }
    wrap.append(fh, famRow, uiRow, this.labelledRow('Size', size), this.checkboxRow('Ligatures', this.d.fontLigatures(), on => this.d.setLigatures(on)))
    return wrap
  }

  private renderEditor(): HTMLElement {
    const wrap = document.createElement('div')
    const eh = document.createElement('h3'); eh.textContent = 'Editor'
    const enabled = this.d.spellCheckEnabled()
    const spell = document.createElement('div'); spell.className = 'settings-group spell-settings'
    const heading = document.createElement('h3'); heading.textContent = 'Spelling'
    const toggle = this.checkboxRow('Check spelling in plain text and Markdown', enabled, on => { void this.d.setSpellCheckEnabled(on).then(() => this.render('spell-enabled')) }, 'spell-enabled')
    const language = document.createElement('select')
    for (const [value, label] of [['system', 'Follow Windows'], ['en-GB', 'English (UK)'], ['en-US', 'English (US)']] as const) {
      const option = document.createElement('option'); option.value = value; option.textContent = label; language.appendChild(option)
    }
    language.value = this.d.spellCheckLanguage(); language.disabled = !enabled; language.dataset.settingsFocus = 'spell-language'
    const note = document.createElement('p'); note.id = 'spell-settings-note'; note.className = 'spell-settings-note'
    note.textContent = 'Works fully offline. Markdown code and technical syntax are ignored.'
    language.setAttribute('aria-describedby', note.id)
    language.onchange = () => { void this.d.setSpellCheckLanguage(language.value as SpellCheckLanguage).then(() => this.render('spell-language')) }
    const dictionary = document.createElement('button'); dictionary.type = 'button'; dictionary.className = 'personal-dictionary-open'
    dictionary.textContent = 'Personal dictionary…'; dictionary.disabled = !enabled; dictionary.onclick = () => this.d.openPersonalDictionary()
    spell.append(heading, toggle, this.labelledRow('Spell check language', language), note)
    if (this.d.spellCheckLanguage() === 'system') {
      const resolved = document.createElement('p'); resolved.className = 'spell-settings-resolved'
      resolved.textContent = this.d.resolvedSpellLocale() === 'en-US' ? 'Currently using English (US).' : 'Currently using English (UK).'
      spell.appendChild(resolved)
    }
    spell.appendChild(dictionary)
    wrap.append(eh, this.checkboxRow('Auto-save changes to disk (named files)', this.d.autoSaveToDisk(), on => this.d.setAutoSaveToDisk(on)), this.checkboxRow('Format on save (named files)', this.d.formatOnSave(), on => this.d.setFormatOnSave(on)), spell)
    return wrap
  }

  private renderFolder(): HTMLElement {
    const wrap = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = 'Folder'
    wrap.append(heading, this.checkboxRow('Show all files (incl. node_modules / .git)', this.d.showAllFiles(), on => this.d.setShowAllFiles(on)), this.checkboxRow('Reopen last folder on launch', this.d.restoreFolder(), on => this.d.setRestoreFolder(on)))
    return wrap
  }

  private renderStartup(): HTMLElement {
    const wrap = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = 'Startup'
    const login = this.checkboxRow('Launch when Windows starts (opens hidden in the tray)', this.d.openAtLogin(), on => this.d.setOpenAtLogin(on))
    const hotkey = document.createElement('div'); hotkey.className = 'appearance-row'
    const hotkeyLabel = document.createElement('span'); hotkeyLabel.textContent = 'Summon hotkey'
    const chips = document.createElement('div'); chips.className = 'hk-chips'
    const parts = formatAccel(this.d.globalHotkey())
    if (parts.length === 0) {
      const none = document.createElement('span'); none.className = 'hk-none'; none.textContent = 'None'; chips.appendChild(none)
    } else for (const p of parts) {
      const chip = document.createElement('kbd'); chip.className = 'hk-chip'; chip.textContent = p; chips.appendChild(chip)
    }
    const instructions = document.createElement('span'); instructions.id = 'hotkey-recorder-instructions'; instructions.className = 'sr-only'
    instructions.textContent = 'Press Record, then press the keyboard shortcut you want to use. Escape cancels recording.'
    const rec = document.createElement('button'); rec.type = 'button'; rec.className = 'hk-record'; rec.textContent = this.recording ? 'Press keys…' : 'Record'
    rec.setAttribute('aria-pressed', String(this.recording)); rec.setAttribute('aria-describedby', instructions.id)
    rec.dataset.settingsFocus = 'hotkey-record'
    rec.onclick = () => { if (!this.recording) this.startRecording() }
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'hk-clear'; clear.textContent = 'Clear'
    clear.dataset.settingsFocus = 'hotkey-clear'
    clear.onclick = () => { this.stopRecording(); void this.d.setGlobalHotkey('').then(() => this.render('hotkey-clear')) }
    hotkey.append(hotkeyLabel, chips, rec, clear, instructions)
    wrap.append(heading, login, hotkey)
    return wrap
  }

  private renderIntegration(): HTMLElement {
    const wrap = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = 'Integration'
    wrap.append(heading, this.checkboxRow('Open with Notes & Codes — Windows right-click menu', this.d.contextMenuEnabled(), on => { void this.d.setContextMenu(on).then(() => this.render('context-menu')) }, 'context-menu'))
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

  private activateCategory(category: SettingsCategory, focusTab: boolean): void {
    this.stopRecording()
    this.active = category
    this.render()
    if (focusTab) this.nav.querySelector<HTMLElement>(`#settings-tab-${category}`)?.focus()
  }

  private render(focusKey?: string): void {
    this.nav.replaceChildren()
    for (const category of CATEGORIES) {
      const tab = document.createElement('button')
      tab.type = 'button'; tab.className = 'settings-cat' + (category.id === this.active ? ' active' : '')
      tab.id = `settings-tab-${category.id}`
      tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `settings-panel-${category.id}`)
      tab.setAttribute('aria-selected', String(category.id === this.active))
      tab.tabIndex = category.id === this.active ? 0 : -1
      tab.textContent = category.label
      tab.onclick = () => this.activateCategory(category.id, true)
      tab.onkeydown = event => {
        const tabs = [...this.nav.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        const next = moveRovingIndex(tabs.indexOf(tab), tabs.map(() => true), event.key, 'vertical')
        if (next === null) return
        event.preventDefault(); this.activateCategory(CATEGORIES[next].id, true)
      }
      this.nav.appendChild(tab)
    }
    const panels = CATEGORIES.map(category => {
      const panel = document.createElement('div')
      panel.id = `settings-panel-${category.id}`; panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', `settings-tab-${category.id}`)
      if (category.id === this.active) panel.appendChild(this.renderDetail())
      else panel.hidden = true
      return panel
    })
    this.detail.replaceChildren(...panels)
    if (focusKey) this.detail.querySelector<HTMLElement>(`[data-settings-focus="${focusKey}"]`)?.focus()
  }
}
