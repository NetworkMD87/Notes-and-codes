import { describe, it, expect } from 'vitest'
import { accelFromEvent, formatAccel } from '../../src/shared/accelerator'

const ev = (over: Partial<Parameters<typeof accelFromEvent>[0]>) => ({
  key: 'a', code: 'KeyA', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over,
})

describe('accelFromEvent', () => {
  it('builds a Ctrl+Shift combo', () => {
    const r = accelFromEvent(ev({ key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+Shift+N' })
  })

  it('orders modifiers canonically regardless of which flags are set', () => {
    const r = accelFromEvent(ev({ key: 'j', code: 'KeyJ', altKey: true, ctrlKey: true, shiftKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+Alt+Shift+J' })
  })

  it('maps Space by code, not by its blank key value', () => {
    const r = accelFromEvent(ev({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+Shift+Space' })
  })

  it('supports function keys', () => {
    const r = accelFromEvent(ev({ key: 'F9', code: 'F9', ctrlKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+F9' })
  })

  it('supports digits and arrows', () => {
    expect(accelFromEvent(ev({ key: '4', code: 'Digit4', ctrlKey: true, altKey: true })))
      .toEqual({ ok: true, accel: 'CommandOrControl+Alt+4' })
    expect(accelFromEvent(ev({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true, altKey: true })))
      .toEqual({ ok: true, accel: 'CommandOrControl+Alt+Up' })
  })

  it('rejects a keystroke with no modifier — a bare key bound globally eats it system-wide', () => {
    const r = accelFromEvent(ev({ key: 'F5', code: 'F5' }))
    expect(r).toEqual({ ok: false, reason: 'Add a modifier — Ctrl, Alt, or Shift.' })
  })

  it('rejects Shift as the only modifier — Shift+letter is just typing', () => {
    const r = accelFromEvent(ev({ key: 'A', code: 'KeyA', shiftKey: true }))
    expect(r).toEqual({ ok: false, reason: 'Add a modifier — Ctrl, Alt, or Shift.' })
  })

  it.each(['Escape', 'Tab', 'Enter'])('rejects bare %s as the key', (code) => {
    const r = accelFromEvent(ev({ key: code, code, ctrlKey: true }))
    expect(r.ok).toBe(false)
  })

  it('returns not-ok while only modifiers are held', () => {
    const r = accelFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))
    expect(r.ok).toBe(false)
  })
})

describe('formatAccel', () => {
  it('splits into display chips with Ctrl spelled out', () => {
    expect(formatAccel('CommandOrControl+Shift+Space')).toEqual(['Ctrl', 'Shift', 'Space'])
  })

  it('returns an empty list for a cleared hotkey', () => {
    expect(formatAccel('')).toEqual([])
  })
})
