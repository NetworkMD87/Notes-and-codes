import { describe, it, expect } from 'vitest'
import { HighlightManager } from '../../src/renderer/highlightManager'

describe('HighlightManager', () => {
  it('toggles mode and defaults to yellow', () => {
    const m = new HighlightManager()
    expect(m.isOn()).toBe(false)
    expect(m.colour()).toBe('yellow')
    expect(m.toggleMode()).toBe(true)
    expect(m.isOn()).toBe(true)
  })
  it('paint delegates to applyStroke in the active colour', () => {
    const m = new HighlightManager()
    m.setColour('green')
    const out = m.paint('buf1', { start: 0, end: 4 })
    expect(out).toEqual([{ start: 0, end: 4, colour: 'green' }])
    expect(m.get('buf1')).toEqual(out)
  })
  it('re-stroking the same colour erases', () => {
    const m = new HighlightManager()
    m.paint('b', { start: 0, end: 6 })          // yellow 0..6
    const out = m.paint('b', { start: 0, end: 6 }) // fully covered → erase
    expect(out).toEqual([])
  })
  it('clear empties a buffer; forget drops it', () => {
    const m = new HighlightManager()
    m.paint('b', { start: 0, end: 3 })
    expect(m.clear('b')).toEqual([])
    m.paint('b', { start: 0, end: 3 })
    m.forget('b')
    expect(m.get('b')).toEqual([])
  })
  it('load and sync set silently', () => {
    const m = new HighlightManager()
    m.load('b', [{ start: 1, end: 2, colour: 'pink' }])
    expect(m.get('b')).toEqual([{ start: 1, end: 2, colour: 'pink' }])
    m.sync('b', [{ start: 3, end: 9, colour: 'blue' }])
    expect(m.get('b')).toEqual([{ start: 3, end: 9, colour: 'blue' }])
  })
})
