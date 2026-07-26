import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RecentFoldersStore } from '../../src/main/recentFoldersStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-recentdirs-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('RecentFoldersStore', () => {
  it('returns [] when missing', async () => {
    expect(await new RecentFoldersStore(dir).load()).toEqual([])
  })

  it('add is most-recent-first and capped', async () => {
    const s = new RecentFoldersStore(dir, 2)
    await s.add('C:\\a'); await s.add('C:\\b'); await s.add('C:\\c')
    expect(await s.load()).toEqual(['C:\\c', 'C:\\b'])
  })

  it('dedupes case-insensitively and bumps the folder to the front', async () => {
    const s = new RecentFoldersStore(dir)
    await s.add('C:\\Projects\\App')
    await s.add('C:\\other')
    await s.add('c:\\projects\\app')
    expect(await s.load()).toEqual(['c:\\projects\\app', 'C:\\other'])
  })

  it('remove drops an entry case-insensitively and returns the new list', async () => {
    const s = new RecentFoldersStore(dir)
    await s.add('C:\\a'); await s.add('C:\\B')
    expect(await s.remove('c:\\b')).toEqual(['C:\\a'])
    expect(await s.load()).toEqual(['C:\\a'])
  })

  it('clear empties it; a corrupt file loads as []', async () => {
    const s = new RecentFoldersStore(dir)
    await s.add('C:\\a'); await s.clear()
    expect(await s.load()).toEqual([])
    writeFileSync(join(dir, 'recent-folders.json'), '{bad')
    expect(await new RecentFoldersStore(dir).load()).toEqual([])
  })

  it('filters non-string entries out of a malformed array', async () => {
    writeFileSync(join(dir, 'recent-folders.json'), JSON.stringify(['C:\\a', 3, null, 'C:\\b']))
    expect(await new RecentFoldersStore(dir).load()).toEqual(['C:\\a', 'C:\\b'])
  })
})
