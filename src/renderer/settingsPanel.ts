import { THEME_LIST, ACCENT_SWATCHES, swatchColours } from './themes'
import { OverlayRegistration } from './overlayManager'
import { accelFromEvent, formatAccel } from '../shared/accelerator'
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
  /** Resolves once the registry write (and, on success, the settings persist) have
   *  settled — the boolean reports whether it succeeded. renderIntegration() uses the
   *  settle (not the boolean) as a cue to re-render, so a reverted value shows up in the
   *  checkbox even though it was set optimistically before the write resolved. */
  setContextMenu: (on: boolean) => Promise<boolean>
  openAtLogin: () => boolean
  setOpenAtLogin: (on: boolean) => void
  globalHotkey: () => string
  setGlobalHotkey: (accel: string) => Promise<boolean>
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
  private reg = new OverlayRegistration()
  private active: SettingsCategory = 'appearance'
  private recording = false
  private keyHandler?: (e: KeyboardEvent) => void

  constructor(parent: HTMLElement, private d: SettingsDeps) {
    this.host = document.createElement('div')
    this.host.className = 'settings hidden'
    this.host.id = 'settings'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  open(category: SettingsCategory = 'appearance'): void {
    // Re-entrant open() (gear button / Ctrl+, / a palette command fired again while the
    // panel is already open) would otherwise switch `active` out from under an in-flight
    // recording the same way the nav-row switch does — tear it down first so that can't happen.
    this.stopRecording()
    // The overlayManager half of the same re-entrancy is handled by OverlayRegistration.open(),
    // which releases the previous slot before taking a new one.
    this.active = category
    this.render()
    this.host.classList.remove('hidden')
    this.reg.open(() => this.close())
  }

  private close(): void {
    // Esc during recording cancels the RECORDING, not the panel. Checking here rather than
    // racing overlayManager's capture-phase listener keeps this independent of listener
    // ordering — a second Esc then closes the panel as normal.
    if (this.recording) { this.cancelRecording(); return }
    this.reg.release()
    this.host.classList.add('hidden')
  }

  // The one place the recording flag and its window-level keydown listener are torn down.
  // Bare teardown only — no render() here, since callers need the teardown to happen
  // synchronously (e.g. before an active-category change or an async IPC call) independent
  // of whether/when they choose to repaint. Safe to call unconditionally: a no-op when not
  // recording. This is what makes it structurally impossible to leave `keyHandler` attached
  // to `window` while the recorder widget isn't the thing on screen — every path that changes
  // `active` or hides the panel routes through here first, instead of each trusting the others.
  private stopRecording(): void {
    this.recording = false
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = undefined }
  }

  private cancelRecording(): void {
    this.stopRecording()
    this.render()
  }

  // The window can go away without any in-panel path ever running: hide-to-tray (the X
  // button), the OS-level summon hotkey (globalShortcut, bound in the main process — this
  // renderer's preventDefault() cannot intercept it), a minimise, or a plain alt-tab. Once the
  // window can't receive the keys being recorded, an armed recorder is worse than useless —
  // every later keystroke (Monaco, Ctrl+S, everything) gets silently swallowed by the
  // still-attached capture-phase keyHandler until Settings is reopened and Escape pressed
  // twice. main.ts wires window.api.onWindowBlur() to this — main's `win.on('blur', …)` is
  // the one signal that actually covers all four triggers uniformly (Electron emits it
  // whenever the BrowserWindow loses OS focus, which subsumes hide/minimise/alt-tab).
  //
  // Not a renderer-side `window`/`document` listener: the DOM `blur` and `visibilitychange`
  // events do NOT reliably fire on a real BrowserWindow.hide()/.show() under Playwright/CDP
  // automation (verified directly — document.hidden and document.hasFocus() both kept
  // reporting the pre-hide state, and neither event fired, even though
  // BrowserWindow.isVisible() genuinely went false and Electron's own main-process 'blur'
  // fired right on cue). A renderer-only fix would therefore be both unverifiable by the
  // required smoke test AND, per that same evidence, not something to trust in the packaged
  // app either. Cancels the same way Escape does — the user just presses Record again — and
  // is a no-op via stopRecording() when nothing is armed, so this can't spuriously cancel a
  // recording the user is actively making: focus moving between elements INSIDE this window
  // (nav clicks, Clear, a checkbox toggle) never fires 'blur' on the BrowserWindow itself,
  // only a genuine loss of the window's OS focus does.
  //
  // Known, accepted edge case: a native dialog (e.g. Save As) or undocked DevTools stealing OS
  // focus also cancels an in-progress recording — same graceful degrade as Escape (press Record
  // again), never silent corruption.
  windowLostFocus(): void {
    if (this.recording) this.cancelRecording()
  }

  private startRecording(): void {
    this.recording = true
    // Capture phase + preventDefault: the keys being recorded must not reach Monaco or the
    // app's own accelerators while the recorder is armed.
    this.keyHandler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.code === 'Escape') { this.cancelRecording(); return }
      const r = accelFromEvent(e)
      if (!r.ok) return                       // incomplete combo — keep waiting
      const accel = r.accel
      this.stopRecording()
      void this.d.setGlobalHotkey(accel).then(() => this.render())
    }
    window.addEventListener('keydown', this.keyHandler, true)
    this.render()
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
      grid.appendChild(row)
    }
    // Deliberately no hover preview. It painted the whole app — chrome vars plus a Monaco
    // setTheme on both panes — on hover-in and again on grid-leave, so a passing cursor read
    // as two hard cuts in quick succession: indistinguishable from a rendering bug (owner
    // decision, 2026-07-26). The per-row dots carry each theme's palette, and a click is
    // reversible by clicking another row, so nothing is lost by requiring the click.

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
    const enabled = this.d.spellCheckEnabled()
    const spell = document.createElement('div'); spell.className = 'settings-group spell-settings'
    const heading = document.createElement('h3'); heading.textContent = 'Spelling'
    const toggle = this.checkboxRow(
      'Check spelling in plain text and Markdown',
      enabled,
      on => { void this.d.setSpellCheckEnabled(on).then(() => this.render()) },
    )
    const { row: languageRow } = this.row('Language')
    const language = document.createElement('select')
    language.setAttribute('aria-label', 'Spell check language')
    for (const [value, label] of [
      ['system', 'Follow Windows'],
      ['en-GB', 'English (UK)'],
      ['en-US', 'English (US)'],
    ] as const) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = label
      language.appendChild(option)
    }
    language.value = this.d.spellCheckLanguage()
    language.disabled = !enabled
    language.onchange = () => {
      void this.d.setSpellCheckLanguage(language.value as SpellCheckLanguage).then(() => this.render())
    }
    languageRow.appendChild(language)

    const note = document.createElement('p'); note.className = 'spell-settings-note'
    note.textContent = 'Works fully offline. Markdown code and technical syntax are ignored.'
    const dictionary = document.createElement('button'); dictionary.className = 'personal-dictionary-open'
    dictionary.textContent = 'Personal dictionary…'
    dictionary.disabled = !enabled
    dictionary.onclick = () => this.d.openPersonalDictionary()
    spell.append(heading, toggle, languageRow, note)
    if (this.d.spellCheckLanguage() === 'system') {
      const resolved = document.createElement('p'); resolved.className = 'spell-settings-resolved'
      resolved.textContent = this.d.resolvedSpellLocale() === 'en-US'
        ? 'Currently using English (US).'
        : 'Currently using English (UK).'
      spell.appendChild(resolved)
    }
    spell.appendChild(dictionary)
    wrap.append(
      eh,
      this.checkboxRow('Auto-save changes to disk (named files)', this.d.autoSaveToDisk(), (on) => this.d.setAutoSaveToDisk(on)),
      this.checkboxRow('Format on save (named files)', this.d.formatOnSave(), (on) => this.d.setFormatOnSave(on)),
      spell,
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

    const { row: hkRow } = this.row('Summon hotkey')
    const chips = document.createElement('div'); chips.className = 'hk-chips'
    const parts = formatAccel(this.d.globalHotkey())
    if (parts.length === 0) {
      const none = document.createElement('span'); none.className = 'hk-none'; none.textContent = 'None'
      chips.appendChild(none)
    } else {
      for (const p of parts) {
        const chip = document.createElement('kbd'); chip.className = 'hk-chip'; chip.textContent = p
        chips.appendChild(chip)
      }
    }
    const rec = document.createElement('button'); rec.className = 'hk-record'
    rec.textContent = this.recording ? 'Press keys…' : 'Record'
    rec.onclick = () => { if (!this.recording) this.startRecording() }
    const clear = document.createElement('button'); clear.className = 'hk-clear'; clear.textContent = 'Clear'
    // Clear supersedes an in-flight recording: tear it down synchronously (not merely
    // reset a flag) before firing the async clear, so a combo mid-flight can't complete
    // afterwards and race the clear, and no keydown listener survives on `window`.
    clear.onclick = () => { this.stopRecording(); void this.d.setGlobalHotkey('').then(() => this.render()) }
    hkRow.append(chips, rec, clear)

    wrap.append(hkRow)
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
      // Switching category leaves the recorder widget (if the Startup tab was active and
      // armed) off-screen while `recording`/`keyHandler` would otherwise survive — tear it
      // down first so that can't happen.
      row.onclick = () => { this.stopRecording(); this.active = c.id; this.render() }
      nav.appendChild(row)
    }

    const detail = document.createElement('div'); detail.className = 'settings-detail'
    detail.appendChild(this.renderDetail())

    box.append(nav, detail)
    this.host.replaceChildren(box)
  }
}
