import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  promises as fs,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  type Dirent,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDir, walkFiles, createFile, createFolder, renamePath } from '../../src/main/fsService'
import type { WorkspaceFilter } from '../../src/shared/types'

const DEFAULT_FILTER: WorkspaceFilter = {
  showAll: false,
  excludePatterns: ['**/.git/**', '**/node_modules/**', '**/dist/**'],
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-fs-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('workspace filtering', () => {
  it('filters a lazy directory read relative to the workspace root', async () => {
    const current = join(dir, 'packages', 'app')
    mkdirSync(join(current, 'dist'), { recursive: true })
    writeFileSync(join(current, 'dist', 'drop.js'), '')
    writeFileSync(join(current, 'keep.txt'), '')
    const filter = { ...DEFAULT_FILTER, excludePatterns: ['packages/*/dist/**'] }
    expect((await readDir(dir, current, filter)).map(entry => entry.name))
      .toEqual(['keep.txt'])
  })

  it('prunes excluded directory nodes before descending', async () => {
    mkdirSync(join(dir, 'packages', 'app', 'node_modules'), { recursive: true })
    mkdirSync(join(dir, 'packages', 'app', 'src'), { recursive: true })
    writeFileSync(join(dir, 'packages', 'app', 'node_modules', 'drop.js'), '')
    writeFileSync(join(dir, 'packages', 'app', 'src', 'keep.ts'), '')
    const result = await walkFiles(dir, DEFAULT_FILTER)
    expect(result.files).toEqual([join(dir, 'packages', 'app', 'src', 'keep.ts')])
    expect(result.truncated).toBe(false)
  })

  it('Show All bypasses the complete exclusion list', async () => {
    mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'visible.js'), '')
    const filter = { ...DEFAULT_FILTER, showAll: true }
    expect((await readDir(dir, dir, filter)).map(entry => entry.name)).toContain('dist')
    expect((await walkFiles(dir, filter)).files).toContain(join(dir, 'dist', 'visible.js'))
  })

  it('caps files without counting excluded entries as truncation', async () => {
    mkdirSync(join(dir, 'dist')); writeFileSync(join(dir, 'dist', 'ignored.js'), '')
    for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(dir, name), '')
    const result = await walkFiles(dir, DEFAULT_FILTER, { maxFiles: 2 })
    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation for an empty directory after the file cap', async () => {
    writeFileSync(join(dir, 'a.txt'), '')
    mkdirSync(join(dir, 'z-empty'))
    const result = await walkFiles(dir, DEFAULT_FILTER, { maxFiles: 1 })
    expect(result.files).toEqual([join(dir, 'a.txt')])
    expect(result.truncated).toBe(false)
  })

  it('does not report truncation when a directory after the cap contains only excluded files', async () => {
    writeFileSync(join(dir, 'a.txt'), '')
    mkdirSync(join(dir, 'z-container', 'dist'), { recursive: true })
    writeFileSync(join(dir, 'z-container', 'dist', 'ignored.js'), '')
    const result = await walkFiles(dir, DEFAULT_FILTER, { maxFiles: 1 })
    expect(result.files).toEqual([join(dir, 'a.txt')])
    expect(result.truncated).toBe(false)
  })

  it('keeps the same strict Unicode path at the 20,000-file cap for either input order', async () => {
    const earlier = Array.from({ length: 19_999 }, (_, index) =>
      `file-${String(index).padStart(5, '0')}.ts`)
    const decomposed = 'z-cafe\u0301.ts'
    const composed = 'z-caf\u00e9.ts'
    const names = [...earlier, composed, decomposed]
    const fileEntry = (name: string): Dirent => ({
      name,
      parentPath: dir,
      path: dir,
      isFile: () => true,
      isDirectory: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    })
    const readdir = vi.spyOn(fs, 'readdir')
      .mockResolvedValueOnce(names.map(fileEntry))
      .mockResolvedValueOnce([...names].reverse().map(fileEntry))

    try {
      const forward = await walkFiles(dir, DEFAULT_FILTER)
      const reverse = await walkFiles(dir, DEFAULT_FILTER)
      const expectedBoundary = join(dir, decomposed)
      expect(forward.files).toHaveLength(20_000)
      expect(reverse.files).toHaveLength(20_000)
      expect(forward.truncated).toBe(true)
      expect(reverse.truncated).toBe(true)
      expect(forward.files.at(-1)).toBe(expectedBoundary)
      expect(reverse.files.at(-1)).toBe(expectedBoundary)
    } finally {
      readdir.mockRestore()
    }
  })

  it('returns an empty lazy read for a missing path', async () => {
    expect(await readDir(dir, join(dir, 'nope'), DEFAULT_FILTER)).toEqual([])
  })
})

describe('file ops', () => {
  it('createFile makes an empty file; fails if it exists', async () => {
    expect(await createFile(join(dir, 'new.txt'))).toBe(true)
    expect(existsSync(join(dir, 'new.txt'))).toBe(true)
    expect(await createFile(join(dir, 'new.txt'))).toBe(false)
  })
  it('createFolder makes a dir; fails if it exists', async () => {
    expect(await createFolder(join(dir, 'd'))).toBe(true)
    expect(await createFolder(join(dir, 'd'))).toBe(false)
  })
  it('renamePath moves; fails on missing source', async () => {
    writeFileSync(join(dir, 'a.txt'), 'x')
    expect(await renamePath(join(dir, 'a.txt'), join(dir, 'b.txt'))).toBe(true)
    expect(existsSync(join(dir, 'b.txt'))).toBe(true)
    expect(await renamePath(join(dir, 'gone.txt'), join(dir, 'c.txt'))).toBe(false)
  })
})
