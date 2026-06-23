import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RecentFilesStore } from '../../src/main/recentFilesStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-recent-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('RecentFilesStore', () => {
  it('returns [] when missing', async () => { expect(await new RecentFilesStore(dir).load()).toEqual([]) })
  it('add is most-recent-first, deduped, capped', async () => {
    const s = new RecentFilesStore(dir, 2)
    await s.add('a'); await s.add('b'); await s.add('a')
    expect(await s.load()).toEqual(['a', 'b'])
    await s.add('c')
    expect(await s.load()).toEqual(['c', 'a'])
  })
  it('clear empties it; corrupt file → []', async () => {
    const s = new RecentFilesStore(dir)
    await s.add('a'); await s.clear()
    expect(await s.load()).toEqual([])
    writeFileSync(join(dir, 'recent-files.json'), '{bad')
    expect(await new RecentFilesStore(dir).load()).toEqual([])
  })
})
