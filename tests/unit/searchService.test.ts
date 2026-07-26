import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { searchFiles, isBinary } from '../../src/main/searchService'
import type { SearchRequest } from '../../src/shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-search-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const req = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  root: dir,
  query: 'needle',
  opts: { caseSensitive: false, wholeWord: false },
  skipPaths: [],
  showAll: false,
  searchId: 1,
  ...over,
})

describe('isBinary', () => {
  it('detects a NUL byte in the sniff window', () => {
    expect(isBinary(Buffer.from([0x61, 0x00, 0x62]))).toBe(true)
    expect(isBinary(Buffer.from('plain text'))).toBe(false)
  })

  it('does not treat UTF-16 LE BOM as binary', () => {
    const utf16le = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('text', 'utf16le'),
    ])
    expect(isBinary(utf16le)).toBe(false)
  })
})

describe('searchFiles', () => {
  it('finds matches across nested directories', async () => {
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.txt'), 'has a needle here')
    writeFileSync(join(dir, 'sub', 'b.txt'), 'needle\nand needle again')
    const r = await searchFiles(req())
    expect(r.totalMatches).toBe(3)
    expect(r.files).toHaveLength(2)
  })

  it('skips paths in skipPaths', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    const r = await searchFiles(req({ skipPaths: [join(dir, 'a.txt')] }))
    expect(r.totalMatches).toBe(0)
  })

  // Windows paths are case-insensitive. A skip path that differs only in case from the walked
  // path must still match — otherwise a dirty open buffer's stale on-disk copy slips past the
  // skip set and the file shows up twice (live content + stale disk content).
  it('skips paths in skipPaths regardless of case', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    const onDisk = join(dir, 'a.txt')
    const differentCase = onDisk.slice(0, -5) + onDisk.slice(-5).toUpperCase() // ...a.txt -> ...A.TXT
    const r = await searchFiles(req({ skipPaths: [differentCase] }))
    expect(r.totalMatches).toBe(0)
  })

  it('caps at 20 matches per file and flags it', async () => {
    writeFileSync(join(dir, 'many.txt'), Array(50).fill('needle').join('\n'))
    const r = await searchFiles(req())
    expect(r.files[0].matches).toHaveLength(20)
    expect(r.files[0].truncated).toBe(true)
  })

  it('stops walking at the total cap rather than gathering then slicing', async () => {
    // 60 files x 20 usable matches = 1200 > the 1000 cap, so later files are never read.
    for (let i = 0; i < 60; i++) {
      writeFileSync(join(dir, `f${String(i).padStart(3, '0')}.txt`), Array(20).fill('needle').join('\n'))
    }
    const r = await searchFiles(req())
    expect(r.totalMatches).toBe(1000)
    expect(r.truncated).toBe(true)
    expect(r.files.length).toBeLessThan(60)
  })

  it('skips files over 1MB', async () => {
    writeFileSync(join(dir, 'big.txt'), 'needle' + 'x'.repeat(1024 * 1024))
    expect((await searchFiles(req())).totalMatches).toBe(0)
  })

  it('skips binary files', async () => {
    writeFileSync(join(dir, 'bin.dat'), Buffer.concat([Buffer.from('needle'), Buffer.from([0x00])]))
    expect((await searchFiles(req())).totalMatches).toBe(0)
  })

  it('matches inside a UTF-16 LE file', async () => {
    writeFileSync(join(dir, 'utf16.txt'), Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('a needle here', 'utf16le'),
    ]))
    expect((await searchFiles(req())).totalMatches).toBe(1)
  })

  it('returns an empty result when superseded', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    const r = await searchFiles(req(), () => true)
    expect(r.totalMatches).toBe(0)
    expect(r.files).toHaveLength(0)
  })

  it('returns nothing below the minimum query length', async () => {
    writeFileSync(join(dir, 'a.txt'), 'nnn')
    expect((await searchFiles(req({ query: 'n' }))).totalMatches).toBe(0)
  })
})
