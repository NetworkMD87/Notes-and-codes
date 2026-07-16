import { describe, it, expect } from 'vitest'
import { isTrustedSender } from '../../src/main/senderGuard'

describe('isTrustedSender', () => {
  it('accepts a sender identical to the trusted frame', () => {
    const frame = {}
    expect(isTrustedSender(frame, frame)).toBe(true)
  })
  it('rejects a sender that is a different frame', () => {
    expect(isTrustedSender({}, {})).toBe(false)
  })
  it('rejects when there is no trusted frame (window absent/destroyed)', () => {
    expect(isTrustedSender({}, null)).toBe(false)
    expect(isTrustedSender({}, undefined)).toBe(false)
  })
  it('rejects a null sender frame', () => {
    const frame = {}
    expect(isTrustedSender(null, frame)).toBe(false)
  })
})
