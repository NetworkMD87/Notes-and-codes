import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClipboardHistoryStore } from '../../src/main/clipboardHistoryStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-clip-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('ClipboardHistoryStore', () => {
  it('returns [] when missing', async () => {
    expect(await new ClipboardHistoryStore(dir).load()).toEqual([])
  })
  it('saves and reloads', async () => {
    const s = new ClipboardHistoryStore(dir)
    await s.save(['a', 'b'])
    expect(await new ClipboardHistoryStore(dir).load()).toEqual(['a', 'b'])
  })
  it('returns [] on corrupt file', async () => {
    writeFileSync(join(dir, 'clipboard-history.json'), '{bad')
    expect(await new ClipboardHistoryStore(dir).load()).toEqual([])
  })
  it('clamps to at most 50 entries on save (main can\'t trust the payload)', async () => {
    const s = new ClipboardHistoryStore(dir)
    await s.save(Array.from({ length: 80 }, (_, i) => 'e' + i))
    expect((await s.load()).length).toBe(50)
  })
  it('truncates an oversized entry on save', async () => {
    const s = new ClipboardHistoryStore(dir)
    await s.save(['x'.repeat(3_000_000)])
    const out = await s.load()
    expect(out[0].length).toBeLessThan(3_000_000)
  })
})
