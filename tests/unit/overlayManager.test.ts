import { describe, it, expect, vi } from 'vitest'
import { pushOverlay, openCount, handleEscape, OverlayRegistration } from '../../src/renderer/overlayManager'

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

describe('OverlayRegistration', () => {
  it('re-entrant open() holds exactly one stack entry, never a stale second', () => {
    const start = openCount()
    const reg = new OverlayRegistration()
    reg.open(() => {})
    reg.open(() => {})   // overlay re-opened while already open (Ctrl+P twice, palette command re-run)
    reg.open(() => {})
    expect(openCount()).toBe(start + 1)
    reg.release()
    expect(openCount()).toBe(start)
  })

  it('a re-entrant open() replaces the close callback, so Escape runs the live one', () => {
    const stale = vi.fn(); const live = vi.fn()
    const reg = new OverlayRegistration()
    reg.open(stale)
    reg.open(live)
    esc()
    expect(live).toHaveBeenCalledTimes(1)
    expect(stale).not.toHaveBeenCalled()
    reg.release()
  })

  it('leaves no entry behind that could swallow a later Escape', () => {
    const start = openCount()
    const reg = new OverlayRegistration()
    reg.open(() => reg.release())   // real overlays release inside close()
    reg.open(() => reg.release())
    esc()                            // closes it for real
    expect(openCount()).toBe(start)
    const after = esc()              // nothing left to consume this one
    expect(after.preventDefault).not.toHaveBeenCalled()
  })

  it('release() is idempotent and re-opening after release registers again', () => {
    const start = openCount()
    const reg = new OverlayRegistration()
    reg.open(() => {})
    reg.release()
    reg.release()                    // no throw, no double-remove of someone else's entry
    expect(openCount()).toBe(start)
    reg.open(() => {})
    expect(openCount()).toBe(start + 1)
    reg.release()
  })
})
