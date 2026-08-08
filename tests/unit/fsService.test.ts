import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
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
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'keep.txt'), ''); writeFileSync(join(dir, 'drop.log'), '')
    const filter = { ...DEFAULT_FILTER, excludePatterns: ['dist/**', '*.log'] }
    expect((await readDir(dir, dir, filter)).map(entry => entry.name))
      .toEqual(['src', 'keep.txt'])
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
