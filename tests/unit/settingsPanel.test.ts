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
    workspaceExcludes: () => ['**/dist/**'], setWorkspaceExcludes: vi.fn(async () => {}),
    restoreWorkspaceExcludes: vi.fn(async () => {}),
    autoSaveToDisk: () => false, setAutoSaveToDisk: vi.fn(), formatOnSave: () => false, setFormatOnSave: vi.fn(),
    spellCheckEnabled: () => true, setSpellCheckEnabled: vi.fn(async () => {}),
    spellCheckLanguage: () => 'system', setSpellCheckLanguage: vi.fn(async () => {}), resolvedSpellLocale: () => 'en-GB',
    openPersonalDictionary: vi.fn(), contextMenuEnabled: () => false, setContextMenu: vi.fn(async () => true),
    openAtLogin: () => false, setOpenAtLogin: vi.fn(), globalHotkey: () => 'Ctrl+Shift+Space',
    setGlobalHotkey: vi.fn(async () => true), focusEditor: vi.fn(),
  }
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
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

  it('labels and explains the workspace exclusion editor', () => {
    const panel = new SettingsPanel(document.body, deps())
    panel.open('folder')

    const editor = document.querySelector<HTMLTextAreaElement>('#workspace-excludes')
    expect(editor).not.toBeNull()
    expect(document.querySelector<HTMLLabelElement>('label[for="workspace-excludes"]')?.textContent)
      .toBe('Exclude from workspace')
    expect(editor?.value).toBe('**/dist/**')
    const helpId = editor?.getAttribute('aria-describedby')
    expect(helpId).toBe('workspace-excludes-help')
    expect(document.getElementById(helpId!)?.textContent).toContain('** spans folders')
    expect(document.querySelector<HTMLButtonElement>('.workspace-excludes-restore')?.textContent)
      .toBe('Restore defaults')
  })

  it('saves newline patterns and restores defaults before rerendering', async () => {
    let patterns = ['**/dist/**']
    const d = deps()
    d.workspaceExcludes = () => [...patterns]
    d.setWorkspaceExcludes = vi.fn(async next => { patterns = next })
    d.restoreWorkspaceExcludes = vi.fn(async () => { patterns = ['**/.git/**'] })
    const panel = new SettingsPanel(document.body, d)
    panel.open('folder')

    const editor = document.querySelector<HTMLTextAreaElement>('#workspace-excludes')!
    const restore = document.querySelector<HTMLButtonElement>('.workspace-excludes-restore')!
    editor.value = 'src/**\n\ncache/?'
    editor.focus()
    editor.dispatchEvent(new Event('change'))
    restore.focus()
    await vi.waitFor(() => expect(d.setWorkspaceExcludes).toHaveBeenCalledWith(['src/**', '', 'cache/?']))
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#workspace-excludes')?.value)
      .toBe('src/**\n\ncache/?'))
    expect(document.querySelector<HTMLButtonElement>('.workspace-excludes-restore')).toBe(document.activeElement)

    document.querySelector<HTMLButtonElement>('.workspace-excludes-restore')!.click()
    await vi.waitFor(() => expect(d.restoreWorkspaceExcludes).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(document.querySelector<HTMLTextAreaElement>('#workspace-excludes')?.value)
      .toBe('**/.git/**'))
  })

  it('does not detach a newly focused category or unkeyed control when an older save resolves', async () => {
    const saves = [deferred(), deferred()]
    let saveIndex = 0
    const d = deps()
    d.setWorkspaceExcludes = vi.fn(() => saves[saveIndex++].promise)
    const panel = new SettingsPanel(document.body, d)
    panel.open('folder')

    let editor = document.querySelector<HTMLTextAreaElement>('#workspace-excludes')!
    editor.value = '**/first/**'; editor.dispatchEvent(new Event('change'))
    let editorTab = document.querySelector<HTMLButtonElement>('#settings-tab-editor')!
    editorTab.focus(); editorTab.click()
    editorTab = document.querySelector<HTMLButtonElement>('#settings-tab-editor')!
    expect(editorTab).toBe(document.activeElement)
    saves[0].resolve()
    await saves[0].promise
    await Promise.resolve()
    expect(document.querySelector('#settings-tab-editor')).toBe(editorTab)
    expect(editorTab).toBe(document.activeElement)
    expect(editorTab.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true)

    let folderTab = document.querySelector<HTMLButtonElement>('#settings-tab-folder')!
    folderTab.focus(); folderTab.click()
    folderTab = document.querySelector<HTMLButtonElement>('#settings-tab-folder')!
    editor = document.querySelector<HTMLTextAreaElement>('#workspace-excludes')!
    editor.value = '**/second/**'; editor.dispatchEvent(new Event('change'))
    const showAll = document.querySelector<HTMLInputElement>('.appearance-row input[type="checkbox"]')!
    showAll.focus()
    saves[1].resolve()
    await saves[1].promise
    await Promise.resolve()
    expect(document.querySelector('.appearance-row input[type="checkbox"]')).toBe(showAll)
    expect(showAll).toBe(document.activeElement)
    expect(document.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true)
  })
})
