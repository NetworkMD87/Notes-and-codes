import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AutoSaveController, eligibleForAutosave } from '../../src/renderer/autoSaveController'

describe('AutoSaveController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rapid edits into a single flush after delayMs', () => {
    const flush = vi.fn()
    const c = new AutoSaveController({ enabled: () => true, delayMs: 1500, flush })
    c.noteEdit(); vi.advanceTimersByTime(1000)
    c.noteEdit(); vi.advanceTimersByTime(1000)   // resets the timer
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)                  // 1500 since the last noteEdit
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('flushNow flushes immediately and cancels a pending timer', () => {
    const flush = vi.fn()
    const c = new AutoSaveController({ enabled: () => true, delayMs: 1500, flush })
    c.noteEdit()
    c.flushNow()
    expect(flush).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('cancel clears a pending timer without flushing', () => {
    const flush = vi.fn()
    const c = new AutoSaveController({ enabled: () => true, delayMs: 1500, flush })
    c.noteEdit(); c.cancel(); vi.advanceTimersByTime(2000)
    expect(flush).not.toHaveBeenCalled()
  })

  it('no-ops when disabled', () => {
    const flush = vi.fn()
    const c = new AutoSaveController({ enabled: () => false, delayMs: 1500, flush })
    c.noteEdit(); vi.advanceTimersByTime(2000); c.flushNow()
    expect(flush).not.toHaveBeenCalled()
  })
})

describe('eligibleForAutosave', () => {
  const B = (id: string, filePath: string | null, dirty: boolean) => ({ id, filePath, dirty })
  it('selects dirty named non-conflicted buffers only', () => {
    const buffers = [
      B('a', '/x/a.txt', true),    // eligible
      B('b', '/x/b.txt', false),   // clean
      B('c', null, true),          // untitled
      B('d', '/x/d.txt', true),    // conflicted
    ]
    expect(eligibleForAutosave(buffers, new Set(['d']))).toEqual(['a'])
  })
  it('returns empty when nothing qualifies', () => {
    expect(eligibleForAutosave([B('a', null, true), B('b', '/x/b', false)], new Set())).toEqual([])
  })
})
