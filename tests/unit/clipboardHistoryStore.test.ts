import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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
})
