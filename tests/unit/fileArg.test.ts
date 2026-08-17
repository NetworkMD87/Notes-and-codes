import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { pickFileArg } from '../../src/main/fileArg'

const yes = () => true
const no = () => false
const workingDirectory = 'C:\\work\\project'
const pick = (argv: string[], isPackaged: boolean, exists: (path: string) => boolean) =>
  pickFileArg(argv, isPackaged, exists, workingDirectory)

describe('pickFileArg', () => {
  it('packaged: returns the last existing path-like arg', () => {
    expect(pick(['app.exe', '--flag', 'C:/notes/todo.md'], true, yes)).toBe(resolve('C:/notes/todo.md'))
  })
  it('unpackaged: skips the electron exe + entry script', () => {
    expect(pick(['electron.exe', 'main.js', 'C:/a.txt'], false, yes)).toBe(resolve('C:/a.txt'))
  })
  it('ignores switch-style args (leading dash) even when they contain a slash', () => {
    expect(pick(['app.exe', '--user-data-dir=C:/x/y'], true, yes)).toBeNull()
  })
  it('returns null when no arg looks like a path', () => {
    expect(pick(['app.exe', 'plainword'], true, yes)).toBeNull()
  })
  it('prefers an existing file over a stray path-like switch value', () => {
    // reversed order checks the stray first; only the real file exists on disk
    const real = resolve('C:/real.txt')
    const exists = (p: string) => p === real
    expect(pick(['app.exe', 'C:/real.txt', 'C:/switch/val.tmp'], true, exists)).toBe(real)
  })
  it('falls back to the last path-like arg when none exist on disk (no regression)', () => {
    expect(pick(['app.exe', 'C:/gone.md'], true, no)).toBe(resolve('C:/gone.md'))
  })
  it('resolves a relative file against the launching process working directory', () => {
    const expected = resolve(workingDirectory, 'notes/todo.md')
    expect(pick(['app.exe', 'notes/todo.md'], true, path => path === expected)).toBe(expected)
  })
})
