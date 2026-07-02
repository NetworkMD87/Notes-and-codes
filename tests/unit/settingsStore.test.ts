import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
})
