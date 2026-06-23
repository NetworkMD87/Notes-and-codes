import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SnippetStore } from '../../src/main/snippetStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-snip-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SnippetStore', () => {
  it('returns [] when missing', async () => {
    expect(await new SnippetStore(dir).load()).toEqual([])
  })
  it('saves and reloads', async () => {
    const s = new SnippetStore(dir)
    const list = [{ id: 'a', name: 'Sig', body: 'Best,\nDan' }]
    await s.save(list)
    expect(await new SnippetStore(dir).load()).toEqual(list)
  })
  it('returns [] on corrupt file and drops malformed entries', async () => {
    writeFileSync(join(dir, 'snippets.json'), '{bad')
    expect(await new SnippetStore(dir).load()).toEqual([])
    writeFileSync(join(dir, 'snippets.json'), JSON.stringify([{ id: 'a', name: 'x', body: 'y' }, { id: 1 }, 'nope']))
    expect(await new SnippetStore(dir).load()).toEqual([{ id: 'a', name: 'x', body: 'y' }])
  })
})
