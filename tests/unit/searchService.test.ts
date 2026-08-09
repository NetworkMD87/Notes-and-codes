import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { searchFiles, isBinary, type SearchIo } from '../../src/main/searchService'
import type { SearchRequest } from '../../src/shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-search-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const req = (over: Partial<SearchRequest> = {}): SearchRequest => ({
  root: dir,
  query: 'needle',
  opts: { caseSensitive: false, wholeWord: false },
  skipPaths: [],
  filter: { showAll: false, excludePatterns: ['**/dist/**'] },
  scope: { includePatterns: [], excludePatterns: [] },
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
  it('does not read a file after cancellation becomes true during stat', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    let cancelled = false
    let reads = 0
    const io: SearchIo = {
      stat: async () => {
        cancelled = true
        return { isFile: () => true, size: 6 }
      },
      readFile: async () => { reads++; return Buffer.from('needle') },
    }
    const result = await searchFiles(req(), () => cancelled, io)
    expect(reads).toBe(0)
    expect(result).toEqual({ files: [], totalMatches: 0, truncated: false, searchId: 1 })
  })

  it('does not decode or match after cancellation becomes true during read', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    let cancelled = false
    let decodes = 0
    const buffer = Buffer.from('needle')
    const decode = buffer.toString.bind(buffer)
    buffer.toString = ((...args: Parameters<Buffer['toString']>) => {
      decodes++
      return decode(...args)
    }) as Buffer['toString']
    const io: SearchIo = {
      stat: async () => ({ isFile: () => true, size: 6 }),
      readFile: async () => { cancelled = true; return buffer },
    }
    const result = await searchFiles(req(), () => cancelled, io)
    expect(decodes).toBe(0)
    expect(result.totalMatches).toBe(0)
    expect(result.files).toEqual([])
  })

  it('does not match after cancellation becomes true during decode', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    let cancelled = false
    let matchCalls = 0
    const buffer = Buffer.from('needle')
    const decode = buffer.toString.bind(buffer)
    buffer.toString = ((...args: Parameters<Buffer['toString']>) => {
      cancelled = true
      return decode(...args)
    }) as Buffer['toString']
    const originalExec = RegExp.prototype.exec
    const exec = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (value: string) {
      if (this.source === 'needle') matchCalls++
      return originalExec.call(this, value)
    })
    const io: SearchIo = {
      stat: async () => ({ isFile: () => true, size: 6 }),
      readFile: async () => buffer,
    }
    try {
      const result = await searchFiles(req(), () => cancelled, io)
      expect(matchCalls).toBe(0)
      expect(result.files).toEqual([])
    } finally {
      exec.mockRestore()
    }
  })

  it('does not publish matches after cancellation becomes true during matching', async () => {
    writeFileSync(join(dir, 'a.txt'), 'needle')
    let cancelled = false
    const originalExec = RegExp.prototype.exec
    const exec = vi.spyOn(RegExp.prototype, 'exec').mockImplementation(function (value: string) {
      const result = originalExec.call(this, value)
      if (this.source === 'needle') cancelled = true
      return result
    })
    try {
      const result = await searchFiles(req(), () => cancelled)
      expect(result).toEqual({ files: [], totalMatches: 0, truncated: false, searchId: 1 })
    } finally {
      exec.mockRestore()
    }
  })

  it.each(['stat', 'read'] as const)(
    'returns empty when cancellation happens while %s rejects',
    async boundary => {
      writeFileSync(join(dir, 'a.txt'), 'needle')
      writeFileSync(join(dir, 'b.txt'), 'needle')
      let cancelled = false
      const io: SearchIo = {
        stat: async path => {
          if (path.endsWith('b.txt') && boundary === 'stat') {
            cancelled = true
            throw new Error('cancelled stat')
          }
          return { isFile: () => true, size: 6 }
        },
        readFile: async path => {
          if (path.endsWith('b.txt') && boundary === 'read') {
            cancelled = true
            throw new Error('cancelled read')
          }
          return Buffer.from('needle')
        },
      }
      const result = await searchFiles(req(), () => cancelled, io)
      expect(result).toEqual({ files: [], totalMatches: 0, truncated: false, searchId: 1 })
    },
  )

  it('finds matches across nested directories', async () => {
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.txt'), 'has a needle here')
    writeFileSync(join(dir, 'sub', 'b.txt'), 'needle\nand needle again')
    const r = await searchFiles(req())
    expect(r.totalMatches).toBe(3)
    expect(r.files).toHaveLength(2)
  })

  it('applies workspace exclusions unless Show All bypasses them', async () => {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'hidden.txt'), 'needle')
    expect((await searchFiles(req())).totalMatches).toBe(0)
    expect((await searchFiles(req({
      filter: { showAll: true, excludePatterns: ['**/dist/**'] },
    }))).totalMatches).toBe(1)
  })

  it('applies includes before file reads and prunes explicit excludes', async () => {
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'dist'))
    for (const path of [
      join(dir, 'src', 'a.ts'),
      join(dir, 'src', 'a.md'),
      join(dir, 'src', 'a.test.ts'),
      join(dir, 'dist', 'hidden.ts'),
    ]) writeFileSync(path, 'needle')

    const reads: string[] = []
    const io: SearchIo = {
      stat: path => fs.stat(path),
      readFile: async path => {
        reads.push(relative(dir, path).replace(/\\/g, '/'))
        return fs.readFile(path)
      },
    }
    const result = await searchFiles(req({
      filter: { showAll: true, excludePatterns: ['**/dist/**'] },
      scope: {
        includePatterns: ['src/**/*.ts'],
        excludePatterns: ['**/*.test.ts', 'dist/**'],
      },
    }), () => false, io)

    expect(result.files.map(file => relative(dir, file.path).replace(/\\/g, '/')))
      .toEqual(['src/a.ts'])
    expect(reads).toEqual(['src/a.ts'])
  })

  it('prunes explicit search excludes even when Show All bypasses workspace exclusions', async () => {
    mkdirSync(join(dir, 'src'))
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'src', 'visible.ts'), 'needle')
    writeFileSync(join(dir, 'dist', 'hidden.ts'), 'needle')
    let directoryReads = 0

    const result = await searchFiles(req({
      filter: { showAll: true, excludePatterns: ['**/src/**'] },
      scope: { includePatterns: [], excludePatterns: ['dist/**'] },
    }), () => false, undefined, {
      afterDirectoryRead: async () => { directoryReads++ },
    })

    expect(directoryReads).toBe(2)
    expect(result.files.map(file => relative(dir, file.path).replace(/\\/g, '/')))
      .toEqual(['src/visible.ts'])
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
