import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../../src/main/settingsStore'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-set-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SettingsStore', () => {
  it('returns defaults when missing', async () => {
    expect(await new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS)
  })
  it('merges partial saved settings onto defaults', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
    const s = await new SettingsStore(dir).load()
    expect(s.theme).toBe('dark')
    expect(s.autoSaveSession).toBe(true) // default preserved
  })
  it('saves and reloads', async () => {
    const store = new SettingsStore(dir)
    await store.save({ ...DEFAULT_SETTINGS, theme: 'light', autoSaveSession: false })
    const s = await new SettingsStore(dir).load()
    expect(s.theme).toBe('light')
    expect(s.autoSaveSession).toBe(false)
  })
  it('defaults uiFontFamily to System', async () => {
    const s = await new SettingsStore(dir).load()
    expect(s.uiFontFamily).toBe('System')
  })
  it('persists a chosen uiFontFamily', async () => {
    const store = new SettingsStore(dir)
    await store.save({ ...DEFAULT_SETTINGS, uiFontFamily: 'Fira Code' })
    expect((await new SettingsStore(dir).load()).uiFontFamily).toBe('Fira Code')
  })
  it('update merges a partial onto the stored settings', async () => {
    const store = new SettingsStore(dir)
    await store.update({ fontSize: 20 })
    const s = await store.load()
    expect(s.fontSize).toBe(20)
    expect(s.themeId).toBe('dark') // untouched default preserved
  })
  it('serializes concurrent updates so neither field is clobbered', async () => {
    // The whole point of settings:update — two overlapping toggles must not read the same
    // base and last-write-win over each other's field.
    const store = new SettingsStore(dir)
    await Promise.all([store.update({ fontSize: 20 }), store.update({ themeId: 'nord' })])
    const s = await store.load()
    expect(s.fontSize).toBe(20)
    expect(s.themeId).toBe('nord')
  })
  it('defaults openAtLogin to false for a settings file written before the field existed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nc-settings-oal-'))
    try {
      writeFileSync(join(dir, 'settings.json'), JSON.stringify({ themeId: 'nord' }))
      const store = new SettingsStore(dir)
      const s = await store.load()
      expect(s.openAtLogin).toBe(false)
      expect(s.themeId).toBe('nord')   // the stored field still wins
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('defaults spell check settings for a file written before those fields existed', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ themeId: 'nord' }))

    const settings = await new SettingsStore(dir).load()

    expect(settings.spellCheckEnabled).toBe(true)
    expect(settings.spellCheckLanguage).toBe('system')
    expect(settings.themeId).toBe('nord')
  })
  it('defaults the active highlighter colour for a settings file written before the field existed', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ themeId: 'nord' }))

    const settings = await new SettingsStore(dir).load()

    expect(settings.lastHighlightColour).toBe('yellow')
    expect(settings.themeId).toBe('nord')
  })
  it.each(['magenta', 7, null])('rejects an invalid persisted highlighter colour: %j', async (lastHighlightColour) => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastHighlightColour }))

    expect((await new SettingsStore(dir).load()).lastHighlightColour).toBe('yellow')
  })
  it('persists the last selected highlighter colour through an update', async () => {
    const store = new SettingsStore(dir)

    await store.update({ lastHighlightColour: 'blue' })

    expect((await new SettingsStore(dir).load()).lastHighlightColour).toBe('blue')
  })
  it('persists explicit spell check settings', async () => {
    const store = new SettingsStore(dir)
    await store.save({
      ...DEFAULT_SETTINGS,
      spellCheckEnabled: false,
      spellCheckLanguage: 'en-US',
    })

    const settings = await new SettingsStore(dir).load()

    expect(settings.spellCheckEnabled).toBe(false)
    expect(settings.spellCheckLanguage).toBe('en-US')
  })

  it('defaults workspace exclusions for a settings file written before the field existed', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ themeId: 'nord' }))
    const settings = await new SettingsStore(dir).load()
    expect(settings.workspaceExcludes).toEqual(DEFAULT_SETTINGS.workspaceExcludes)
    expect(settings.workspaceExcludes).not.toBe(DEFAULT_SETTINGS.workspaceExcludes)
  })

  it('normalizes the update result and persisted workspace exclusions', async () => {
    const store = new SettingsStore(dir)
    const updated = await store.update({
      workspaceExcludes: [' /SRC\\** ', 'src/**', '', '/dist/**'],
    })

    expect(updated.workspaceExcludes).toEqual(['SRC/**', 'dist/**'])
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).workspaceExcludes)
      .toEqual(['SRC/**', 'dist/**'])
    expect((await store.load()).workspaceExcludes).toEqual(['SRC/**', 'dist/**'])
  })

  it('permits an empty persisted workspace exclusion list', async () => {
    const store = new SettingsStore(dir)
    await store.update({ workspaceExcludes: [] })
    expect((await store.load()).workspaceExcludes).toEqual([])
  })

  it('normalizes workspace exclusions before save resolves and writes them', async () => {
    const store = new SettingsStore(dir)
    const result = await store.save({
      ...DEFAULT_SETTINGS,
      workspaceExcludes: [' /SRC\\** ', 'src/**', '', '/dist/**'],
    })

    expect(result).toBeUndefined()
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).workspaceExcludes)
      .toEqual(['SRC/**', 'dist/**'])
    expect((await store.load()).workspaceExcludes).toEqual(['SRC/**', 'dist/**'])
  })

  it('falls back to defaults when workspaceExcludes has the wrong persisted type', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ workspaceExcludes: 'dist/**' }))
    expect((await new SettingsStore(dir).load()).workspaceExcludes)
      .toEqual(DEFAULT_SETTINGS.workspaceExcludes)
  })
})
