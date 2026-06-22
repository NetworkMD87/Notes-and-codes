import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

describe('DEFAULT_SETTINGS', () => {
  it('defaults theme to follow-os and auto-save on', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('follow-os')
    expect(DEFAULT_SETTINGS.autoSaveSession).toBe(true)
    expect(DEFAULT_SETTINGS.contextMenuEnabled).toBe(false)
  })
})
