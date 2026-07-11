import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HighlightStore } from '../../src/main/highlightStore'
import type { Highlight } from '../../src/shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-hl-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const HS: Highlight[] = [{ start: 0, end: 5, colour: 'yellow' }]

describe('HighlightStore', () => {
  it('missing → empty', async () => {
    expect(await new HighlightStore(dir).load('C:/a.txt')).toEqual([])
  })
  it('save then load round-trips', async () => {
    const s = new HighlightStore(dir)
    await s.save('C:/a.txt', HS)
    expect(await s.load('C:/a.txt')).toEqual(HS)
  })
  it('empty array deletes the key', async () => {
    const s = new HighlightStore(dir)
    await s.save('C:/a.txt', HS)
    await s.save('C:/a.txt', [])
    expect(await s.load('C:/a.txt')).toEqual([])
  })
  it('keeps paths independent', async () => {
    const s = new HighlightStore(dir)
    await s.save('C:/a.txt', HS)
    await s.save('C:/b.txt', [{ start: 1, end: 2, colour: 'green' }])
    expect(await s.load('C:/a.txt')).toEqual(HS)
  })
  it('filters malformed entries', async () => {
    const s = new HighlightStore(dir)
    await s.save('C:/a.txt', [
      { start: 0, end: 5, colour: 'yellow' },
      { start: 5, end: 5, colour: 'yellow' },       // zero-length → dropped
      { start: 0, end: 3, colour: 'magenta' } as unknown as Highlight, // bad colour (not in palette) → dropped
    ])
    expect(await s.load('C:/a.txt')).toEqual([{ start: 0, end: 5, colour: 'yellow' }])
  })
  it('corrupt file → empty', async () => {
    const s = new HighlightStore(dir)
    writeFileSync(join(dir, 'highlights.json'), '{bad')
    expect(await s.load('C:/a.txt')).toEqual([])
  })
  it('sweep drops highlights whose source file no longer exists, keeps live ones', async () => {
    const real = join(dir, 'real.txt'); writeFileSync(real, 'hi')
    const gone = join(dir, 'gone.txt') // never created on disk
    const s = new HighlightStore(dir)
    await s.save(real, HS)
    await s.save(gone, HS)
    await s.sweep()
    expect(await s.load(real)).toEqual(HS)
    expect(await s.load(gone)).toEqual([]) // orphan entry removed
  })
})
