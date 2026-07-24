import { describe, it, expect } from 'vitest'
import { TOAST_ICONS, TOAST_MS, type ToastLevel } from '../../src/renderer/notify'

const LEVELS: ToastLevel[] = ['info', 'success', 'warning', 'error']

describe('toast level tables', () => {
  it('defines a non-empty icon path set for every level', () => {
    for (const lv of LEVELS) {
      expect(Array.isArray(TOAST_ICONS[lv]), lv).toBe(true)
      expect(TOAST_ICONS[lv].length, lv).toBeGreaterThan(0)
      for (const d of TOAST_ICONS[lv]) expect(typeof d, `${lv} path`).toBe('string')
    }
  })
  it('defines a positive duration for every level', () => {
    for (const lv of LEVELS) expect(TOAST_MS[lv], lv).toBeGreaterThan(0)
  })
  it('lets errors and warnings dwell longer than info/success', () => {
    expect(TOAST_MS.error).toBeGreaterThan(TOAST_MS.info)
    expect(TOAST_MS.warning).toBeGreaterThan(TOAST_MS.success)
  })
})
