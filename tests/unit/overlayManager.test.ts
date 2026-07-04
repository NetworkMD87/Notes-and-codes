import { describe, it, expect, vi } from 'vitest'
import { pushOverlay, openCount, handleEscape } from '../../src/renderer/overlayManager'

function esc(key = 'Escape') {
  const e = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }
  handleEscape(e)
  return e
}

describe('overlayManager', () => {
  it('tracks open count and unregisters exactly its own entry', () => {
    const start = openCount()
    const a = pushOverlay(() => {})
    const b = pushOverlay(() => {})
    expect(openCount()).toBe(start + 2)
    a()
    expect(openCount()).toBe(start + 1)
    a() // idempotent — no throw, no double-remove
    expect(openCount()).toBe(start + 1)
    b()
    expect(openCount()).toBe(start)
  })

  it('Escape closes only the topmost overlay (LIFO)', () => {
    const closedA = vi.fn(); const closedB = vi.fn()
    const unregA = pushOverlay(closedA)
    const unregB = pushOverlay(() => { closedB(); unregB() }) // real overlays unregister in close()
    const e = esc()
    expect(closedB).toHaveBeenCalledTimes(1)
    expect(closedA).not.toHaveBeenCalled()
    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    esc() // now A is topmost
    expect(closedA).toHaveBeenCalledTimes(1)
    unregA()
  })

  it('Escape with an empty stack and non-Escape keys are no-ops', () => {
    const before = openCount()
    expect(() => esc()).not.toThrow()          // empty stack
    const closed = vi.fn(); const un = pushOverlay(closed)
    esc('a')                                    // not Escape
    expect(closed).not.toHaveBeenCalled()
    expect(openCount()).toBe(before + 1)
    un()
  })
})
