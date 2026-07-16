import { describe, it, expect } from 'vitest'
import { pickFileArg } from '../../src/main/fileArg'

const yes = () => true
const no = () => false

describe('pickFileArg', () => {
  it('packaged: returns the last existing path-like arg', () => {
    expect(pickFileArg(['app.exe', '--flag', 'C:/notes/todo.md'], true, yes)).toBe('C:/notes/todo.md')
  })
  it('unpackaged: skips the electron exe + entry script', () => {
    expect(pickFileArg(['electron.exe', 'main.js', 'C:/a.txt'], false, yes)).toBe('C:/a.txt')
  })
  it('ignores switch-style args (leading dash) even when they contain a slash', () => {
    expect(pickFileArg(['app.exe', '--user-data-dir=C:/x/y'], true, yes)).toBeNull()
  })
  it('returns null when no arg looks like a path', () => {
    expect(pickFileArg(['app.exe', 'plainword'], true, yes)).toBeNull()
  })
  it('prefers an existing file over a stray path-like switch value', () => {
    // reversed order checks the stray first; only the real file exists on disk
    const exists = (p: string) => p === 'C:/real.txt'
    expect(pickFileArg(['app.exe', 'C:/real.txt', 'C:/switch/val.tmp'], true, exists)).toBe('C:/real.txt')
  })
  it('falls back to the last path-like arg when none exist on disk (no regression)', () => {
    expect(pickFileArg(['app.exe', 'C:/gone.md'], true, no)).toBe('C:/gone.md')
  })
})
