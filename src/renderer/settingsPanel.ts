import { THEME_LIST, ACCENT_SWATCHES, swatchColours } from './themes'
import { DialogController } from './dialogController'
import { OverlayRegistration } from './overlayManager'
import { accelFromEvent, formatAccel } from '../shared/accelerator'
import { moveRovingIndex } from './rovingIndex'
import type { ResolvedSpellLocale, SpellCheckLanguage } from '../shared/spell'
import type { TabSizing } from '../shared/types'

export type SettingsCategory = 'appearance' | 'font' | 'editor' | 'folder' | 'startup' | 'integration'

export interface SettingsDeps {
  currentThemeId: () => string
  currentAccent: () => string | null
  pickTheme: (id: string) => void
  setAccent: (accent: string | null) => void
  tabSizing: () => TabSizing
  setTabSizing: (mode: TabSizing) => void
  fontFamily: () => string
  setFontFamily: (name: string) => void
  fontLigatures: () => boolean
  setLigatures: (on: boolean) => void
  uiFontFamily: () => string
  setUiFontFamily: (name: string) => void
  fontSize: () => number
  setFontSize: (px: number) => void
  showMinimap: () => boolean
  setShowMinimap: (on: boolean) => void
  rememberMarkdownPreviewMode: () => boolean
  setRememberMarkdownPreviewMode: (remember: boolean) => void
  showAllFiles: () => boolean
  setShowAllFiles: (on: boolean) => void
  workspaceExcludes: () => string[]
  setWorkspaceExcludes: (patterns: string[]) => Promise<void>
  restoreWorkspaceExcludes: () => Promise<void>
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

interface WorkspaceExclusionOwner {
  editor: HTMLTextAreaElement
  draftGeneration: number
}

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
  private workspaceExclusionGeneration = 0
  private workspaceExclusionDraftGeneration = 0
  private readonly tabSizingOverlay = new OverlayRegistration()
  private closeTabSizing?: (restoreFocus?: boolean) => void

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
    this.closeTabSizing?.(false)
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

  private labelledRow(labelText: string, control: HTMLInputElement | HTMLSelectElement | HTMLButtonElement): HTMLDivElement {
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

  private tabSizingRow(): HTMLDivElement {
    const choices: readonly (readonly [TabSizing, string])[] = [
      ['bounded', 'Bounded'],
      ['natural', 'Natural width'],
    ]
    const current = this.d.tabSizing()
    const picker = document.createElement('div'); picker.className = 'tab-sizing-picker'
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'tab-sizing-select'
    const value = document.createElement('span'); value.className = 'tab-sizing-value'
    value.textContent = choices.find(([choice]) => choice === current)?.[1] ?? 'Bounded'
    const chevron = document.createElement('span'); chevron.className = 'tab-sizing-chevron'
    chevron.textContent = '▾'; chevron.setAttribute('aria-hidden', 'true')
    trigger.append(value, chevron)

    const row = this.labelledRow('Tab sizing', trigger)
    value.id = `${trigger.id}-value`; trigger.setAttribute('aria-describedby', value.id)
    const list = document.createElement('div'); list.className = 'tab-sizing-options'; list.hidden = true
    list.id = `${trigger.id}-options`; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Tab sizing')
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', list.id)

    const options: HTMLElement[] = []
    const close = (restoreFocus = false): void => {
      this.box.removeEventListener('scroll', closeForGeometryChange, true)
      window.removeEventListener('resize', closeForGeometryChange)
      this.tabSizingOverlay.release()
      if (this.closeTabSizing === close) this.closeTabSizing = undefined
      list.hidden = true
      trigger.setAttribute('aria-expanded', 'false')
      for (const option of options) option.tabIndex = -1
      if (restoreFocus) trigger.focus({ preventScroll: true })
    }
    const closeForGeometryChange = (): void => close(true)
    const open = (): void => {
      list.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      const triggerRect = trigger.getBoundingClientRect()
      list.style.left = `${triggerRect.left}px`
      list.style.width = `${triggerRect.width}px`
      const listHeight = list.getBoundingClientRect().height
      const below = triggerRect.bottom + 2
      list.style.top = `${below + listHeight <= window.innerHeight - 8 ? below : Math.max(8, triggerRect.top - listHeight - 2)}px`
      const selected = options.find(option => option.getAttribute('aria-selected') === 'true') ?? options[0]
      for (const option of options) option.tabIndex = option === selected ? 0 : -1
      selected?.focus()
      this.closeTabSizing = close
      this.tabSizingOverlay.open(() => close(true))
      this.box.addEventListener('scroll', closeForGeometryChange, true)
      window.addEventListener('resize', closeForGeometryChange)
    }
    const choose = (choice: TabSizing, label: string): void => {
      value.textContent = label
      for (const option of options) option.setAttribute('aria-selected', String(option.dataset.value === choice))
      this.d.setTabSizing(choice)
      close(true)
    }

    for (const [choice, label] of choices) {
      const option = document.createElement('div'); option.className = 'tab-sizing-option'
      option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(choice === current))
      option.dataset.value = choice; option.textContent = label; option.tabIndex = -1
      option.onclick = () => choose(choice, label)
      option.onkeydown = event => {
        const index = options.indexOf(option)
        let next: number | null = null
        if (event.key === 'ArrowDown') next = (index + 1) % options.length
        else if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = options.length - 1
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); option.click(); return }
        else if (event.key === 'Escape') { event.preventDefault(); close(true); return }
        if (next === null) return
        event.preventDefault()
        for (const [optionIndex, candidate] of options.entries()) candidate.tabIndex = optionIndex === next ? 0 : -1
        options[next].focus()
      }
      options.push(option); list.appendChild(option)
    }

    trigger.onclick = () => { if (list.hidden) open(); else close() }
    trigger.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open() }
      else if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); close(true) }
    }
    picker.addEventListener('focusout', event => {
      const next = event.relatedTarget
      if (!(next instanceof Node) || !picker.contains(next)) close()
    })
    picker.append(trigger, list); row.appendChild(picker)
    return row
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
    const tabGroup = document.createElement('div'); tabGroup.className = 'settings-group'
    const tabHeading = document.createElement('h3'); tabHeading.textContent = 'Tabs'
    tabGroup.append(tabHeading, this.tabSizingRow())
    wrap.append(th, grid, head, sw, tabGroup)
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
    const previewSettings = document.createElement('div')
    previewSettings.className = 'settings-group markdown-preview-settings'
    const previewHeading = document.createElement('h3')
    previewHeading.textContent = 'Markdown preview'
    const rememberRow = this.checkboxRow(
      'Remember Markdown preview mode',
      this.d.rememberMarkdownPreviewMode(),
      remember => this.d.setRememberMarkdownPreviewMode(remember),
    )
    const checkbox = rememberRow.querySelector<HTMLInputElement>('input')!
    const previewNote = document.createElement('p')
    previewNote.id = 'markdown-preview-remember-note'
    previewNote.className = 'settings-note'
    previewNote.textContent = 'Restore Off, Side by side, or Focus when reopening the app.'
    checkbox.setAttribute('aria-describedby', previewNote.id)
    previewSettings.append(previewHeading, rememberRow, previewNote)
    wrap.append(eh, this.checkboxRow('Show minimap', this.d.showMinimap(), on => this.d.setShowMinimap(on)), this.checkboxRow('Auto-save changes to disk (named files)', this.d.autoSaveToDisk(), on => this.d.setAutoSaveToDisk(on)), this.checkboxRow('Format on save (named files)', this.d.formatOnSave(), on => this.d.setFormatOnSave(on)), previewSettings, spell)
    return wrap
  }

  private renderFolder(): HTMLElement {
    const wrap = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = 'Folder'
    wrap.append(heading, this.checkboxRow('Show all files (incl. node_modules / .git)', this.d.showAllFiles(), on => this.d.setShowAllFiles(on)), this.checkboxRow('Reopen last folder on launch', this.d.restoreFolder(), on => this.d.setRestoreFolder(on)))
    const group = document.createElement('div'); group.className = 'settings-group workspace-excludes'
    const label = document.createElement('label'); label.htmlFor = 'workspace-excludes'
    label.textContent = 'Exclude from workspace'
    const help = document.createElement('p'); help.id = 'workspace-excludes-help'
    help.textContent = 'One workspace-relative pattern per line. * and ? stay within a folder; ** spans folders. Braces, character classes, !, and escapes are literal.'
    const editor = document.createElement('textarea'); editor.id = 'workspace-excludes'; editor.rows = 8
    editor.value = this.d.workspaceExcludes().join('\n')
    editor.dataset.settingsFocus = 'workspace-excludes-editor'
    editor.setAttribute('aria-describedby', help.id)
    editor.oninput = () => { this.workspaceExclusionDraftGeneration++ }
    editor.onchange = () => {
      const generation = ++this.workspaceExclusionGeneration
      const owner = this.workspaceExclusionOwner(editor)
      void this.d.setWorkspaceExcludes(editor.value.split(/\r?\n/)).then(() => {
        this.rerenderWorkspaceExcludes(generation, owner)
      })
    }
    const restore = document.createElement('button'); restore.type = 'button'
    restore.className = 'workspace-excludes-restore'; restore.textContent = 'Restore defaults'
    restore.dataset.settingsFocus = 'workspace-excludes-restore'
    restore.onclick = () => {
      const generation = ++this.workspaceExclusionGeneration
      const owner = this.workspaceExclusionOwner(editor)
      void this.d.restoreWorkspaceExcludes().then(() => {
        this.rerenderWorkspaceExcludes(generation, owner)
      })
    }
    group.append(label, help, editor, restore)
    wrap.append(group)
    return wrap
  }

  private workspaceExclusionOwner(editor: HTMLTextAreaElement): WorkspaceExclusionOwner {
    return { editor, draftGeneration: this.workspaceExclusionDraftGeneration }
  }

  private rerenderWorkspaceExcludes(
    generation: number,
    owner: WorkspaceExclusionOwner,
  ): void {
    if (generation !== this.workspaceExclusionGeneration) return
    if (!owner.editor.isConnected || owner.draftGeneration !== this.workspaceExclusionDraftGeneration) return
    const focused = document.activeElement as HTMLElement | null
    if (!focused || !this.box.contains(focused)) return
    const focusKey = focused.dataset.settingsFocus
    // Category tabs and ordinary controls stay mounted while a save that began elsewhere
    // completes. Only keyed exclusion controls opt into a focused rerender.
    if (!focusKey) return
    this.render(focusKey)
  }

  private renderStartup(): HTMLElement {
    const wrap = document.createElement('div')
    const heading = document.createElement('h3'); heading.textContent = 'Startup'
    const login = this.checkboxRow('Launch when Windows starts (opens hidden in the tray)', this.d.openAtLogin(), on => this.d.setOpenAtLogin(on))
    const hotkey = document.createElement('div'); hotkey.className = 'appearance-row'
    const hotkeyLabel = document.createElement('span'); hotkeyLabel.id = 'summon-hotkey-label'; hotkeyLabel.textContent = 'Summon hotkey'
    hotkey.setAttribute('role', 'group'); hotkey.setAttribute('aria-labelledby', hotkeyLabel.id)
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
    this.closeTabSizing?.(false)
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
