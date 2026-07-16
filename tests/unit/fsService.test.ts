import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shouldIgnore, readDir, walkFiles, createFile, createFolder, renamePath } from '../../src/main/fsService'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-fs-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('shouldIgnore', () => {
  it('hides .git and node_modules unless showAll', () => {
    expect(shouldIgnore('.git', false)).toBe(true)
    expect(shouldIgnore('node_modules', false)).toBe(true)
    expect(shouldIgnore('.env', false)).toBe(false)
    expect(shouldIgnore('node_modules', true)).toBe(false)
  })
})

describe('readDir', () => {
  it('returns dirs first then files, alphabetical, ignore-filtered', async () => {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, '.git')); mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'b.txt'), ''); writeFileSync(join(dir, 'a.txt'), '')
    const entries = await readDir(dir, false)
    expect(entries.map(e => e.name)).toEqual(['src', 'a.txt', 'b.txt'])
    expect(entries[0]).toMatchObject({ name: 'src', isDir: true, path: join(dir, 'src') })
  })
  it('showAll includes node_modules', async () => {
    mkdirSync(join(dir, 'node_modules'))
    expect((await readDir(dir, true)).map(e => e.name)).toContain('node_modules')
  })
  it('missing path → []', async () => {
    expect(await readDir(join(dir, 'nope'), false)).toEqual([])
  })
})

describe('walkFiles', () => {
  it('returns all files recursively, skipping ignored dirs; truncated=false under the cap', async () => {
    mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'root.txt'), '')
    writeFileSync(join(dir, 'src', 'a.ts'), '')
    writeFileSync(join(dir, 'node_modules', 'x.js'), '')
    const r = await walkFiles(dir, false)
    expect(r.truncated).toBe(false)
    expect(r.files).toContain(join(dir, 'root.txt'))
    expect(r.files).toContain(join(dir, 'src', 'a.ts'))
    expect(r.files).not.toContain(join(dir, 'node_modules', 'x.js'))
  })
  it('caps the list and flags truncated=true when the file count exceeds max', async () => {
    for (const n of ['a', 'b', 'c']) writeFileSync(join(dir, n + '.txt'), '')
    const r = await walkFiles(dir, false, 2)
    expect(r.files).toHaveLength(2)
    expect(r.truncated).toBe(true)
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
