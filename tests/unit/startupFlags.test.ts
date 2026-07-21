import { describe, it, expect } from 'vitest'
import { shouldStartHidden } from '../../src/main/startupFlags'

describe('shouldStartHidden', () => {
  it('is false with no flag', () => {
    expect(shouldStartHidden(['app.exe'], false)).toBe(false)
  })

  it('is true when --hidden is present and there is no file arg', () => {
    expect(shouldStartHidden(['app.exe', '--hidden'], false)).toBe(true)
  })

  it('is false when a file arg is present, even with --hidden', () => {
    // An "Open with" launch must never be swallowed by a stray startup flag.
    expect(shouldStartHidden(['app.exe', '--hidden', 'C:\\notes\\a.txt'], true)).toBe(false)
  })

  it('ignores other switches', () => {
    expect(shouldStartHidden(['app.exe', '--user-data-dir=C:\\tmp\\x'], false)).toBe(false)
  })

  it('matches the flag exactly, not as a prefix', () => {
    expect(shouldStartHidden(['app.exe', '--hidden-thing'], false)).toBe(false)
  })
})
