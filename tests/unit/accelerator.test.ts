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

  it('gives the modifier-only "keep going" reason specifically, not a generic failure', () => {
    const r = accelFromEvent(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))
    expect(r).toEqual({ ok: false, reason: 'Press a key to finish the shortcut.' })
  })

  it.each(['ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'])(
    'treats bare %s the same way — combo still being assembled',
    (code) => {
      const r = accelFromEvent(ev({ key: code, code, ctrlKey: true }))
      expect(r).toEqual({ ok: false, reason: 'Press a key to finish the shortcut.' })
    },
  )

  it('rejects Alt+F4 — it closes the active window system-wide, in every app', () => {
    const r = accelFromEvent(ev({ key: 'F4', code: 'F4', altKey: true }))
    expect(r).toEqual({ ok: false, reason: "Alt+F4 can't be used as a shortcut — it closes windows system-wide." })
  })

  it('still allows plain F4 (no Alt) — only the Alt+F4 chord is special-cased', () => {
    const r = accelFromEvent(ev({ key: 'F4', code: 'F4', ctrlKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+F4' })
  })

  it('still allows Alt+F4 plus an extra modifier — only the bare chord is reserved', () => {
    const r = accelFromEvent(ev({ key: 'F4', code: 'F4', altKey: true, ctrlKey: true }))
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+Alt+F4' })
  })
})

describe('keyNameFrom — every mapped punctuation/navigation branch (via accelFromEvent)', () => {
  it.each([
    ['Backspace', 'Backspace'],
    ['Delete', 'Delete'],
    ['Insert', 'Insert'],
    ['Home', 'Home'],
    ['End', 'End'],
    ['PageUp', 'PageUp'],
    ['PageDown', 'PageDown'],
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
    ['Backslash', '\\'],
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['BracketLeft', '['],
    ['BracketRight', ']'],
    ['Minus', '-'],
    ['Equal', '='],
    ['Backquote', '`'],
  ])('maps code %s to accelerator key %s', (code, expected) => {
    const r = accelFromEvent(ev({ key: code, code, ctrlKey: true }))
    expect(r).toEqual({ ok: true, accel: `CommandOrControl+${expected}` })
  })
})

describe('Super (the Windows/Meta key)', () => {
  it('records Win+<key> as Super, not folded into CommandOrControl', () => {
    const r = accelFromEvent(ev({ key: 'n', code: 'KeyN', metaKey: true }))
    expect(r).toEqual({ ok: true, accel: 'Super+N' })
  })

  it('still qualifies as a modifier on its own — Win+N is a legal combo to record', () => {
    const r = accelFromEvent(ev({ key: 'n', code: 'KeyN', metaKey: true }))
    expect(r.ok).toBe(true)
  })

  it('orders CommandOrControl, Super, Alt, Shift deterministically when all four are held', () => {
    const r = accelFromEvent(
      ev({ key: 'n', code: 'KeyN', ctrlKey: true, metaKey: true, altKey: true, shiftKey: true }),
    )
    expect(r).toEqual({ ok: true, accel: 'CommandOrControl+Super+Alt+Shift+N' })
  })

  it('formatAccel displays Super as Win', () => {
    expect(formatAccel('Super+N')).toEqual(['Win', 'N'])
  })

  it('formatAccel displays a combined Ctrl+Super+Alt+Shift chip row', () => {
    expect(formatAccel('CommandOrControl+Super+Alt+Shift+N')).toEqual(['Ctrl', 'Win', 'Alt', 'Shift', 'N'])
  })
})

describe('unmapped-but-fully-pressed keys get their own accurate reason', () => {
  it.each([
    ['CapsLock', 'Caps Lock'],
    ['NumLock', 'Num Lock'],
    ['PrintScreen', 'Print Screen'],
    ['ContextMenu', 'Menu'],
    ['Numpad5', 'Numpad 5'],
    ['MediaPlayPause', 'Media Play/Pause'],
  ])('gives %s its own reason, distinct from the modifier-only message', (code, label) => {
    const r = accelFromEvent(ev({ key: code, code, ctrlKey: true }))
    expect(r).toEqual({ ok: false, reason: `${label} can't be used as a shortcut.` })
  })
})

describe('blocked recorder keys use a friendly label, not the raw DOM code', () => {
  it('names NumpadEnter as "Numpad Enter" in the reason', () => {
    const r = accelFromEvent(ev({ key: 'Enter', code: 'NumpadEnter', ctrlKey: true }))
    expect(r).toEqual({ ok: false, reason: "Numpad Enter can't be used as a shortcut." })
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
