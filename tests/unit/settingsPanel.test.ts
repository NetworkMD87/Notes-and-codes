// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsDeps } from '../../src/renderer/settingsPanel'
import { SettingsPanel } from '../../src/renderer/settingsPanel'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

function deps(): SettingsDeps {
  return {
    currentThemeId: () => 'dark', currentAccent: () => null, pickTheme: vi.fn(), setAccent: vi.fn(),
    fontFamily: () => 'JetBrains Mono', setFontFamily: vi.fn(), fontLigatures: () => true, setLigatures: vi.fn(),
    uiFontFamily: () => 'System', setUiFontFamily: vi.fn(), fontSize: () => 14, setFontSize: vi.fn(),
    showAllFiles: () => false, setShowAllFiles: vi.fn(), restoreFolder: () => true, setRestoreFolder: vi.fn(),
    autoSaveToDisk: () => false, setAutoSaveToDisk: vi.fn(), formatOnSave: () => false, setFormatOnSave: vi.fn(),
    spellCheckEnabled: () => true, setSpellCheckEnabled: vi.fn(async () => {}),
    spellCheckLanguage: () => 'system', setSpellCheckLanguage: vi.fn(async () => {}), resolvedSpellLocale: () => 'en-GB',
    openPersonalDictionary: vi.fn(), contextMenuEnabled: () => false, setContextMenu: vi.fn(async () => true),
    openAtLogin: () => false, setOpenAtLogin: vi.fn(), globalHotkey: () => 'Ctrl+Shift+Space',
    setGlobalHotkey: vi.fn(async () => true), focusEditor: vi.fn(),
  }
}

describe('SettingsPanel', () => {
  const baseline = openCount()
  afterEach(() => {
    while (openCount() > baseline) handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
    document.body.replaceChildren()
  })

  it('groups the summon hotkey value and actions under the visible caption', () => {
    const panel = new SettingsPanel(document.body, deps())
    panel.open('startup')

    const group = document.querySelector<HTMLElement>('[role="group"]')
    expect(group).not.toBeNull()
    const labelId = group?.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    expect(document.getElementById(labelId!)?.textContent).toBe('Summon hotkey')
    expect(group?.querySelector('.hk-chips')?.textContent).toBe('CtrlShiftSpace')
    expect([...group!.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Record', 'Clear'])
  })
})
