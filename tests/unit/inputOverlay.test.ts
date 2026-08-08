// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmDialog } from '../../src/renderer/inputOverlay'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const escape = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
const pressEnter = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

describe('confirmDialog', () => {
  const baseline = openCount()

  afterEach(() => {
    while (openCount() > baseline) escape()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('does not settle the opening Enter until its arming frame has run', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    let runArm: (() => void) | undefined
    const scheduleArm = vi.fn((callback: () => void) => { runArm = callback })
    const result = confirmDialog('Discard changes?', { focusFallback: vi.fn() }, scheduleArm)

    pressEnter()
    expect(document.querySelector('.input-overlay')).not.toBeNull()
    expect(scheduleArm).toHaveBeenCalledOnce()

    runArm!()
    pressEnter()
    await expect(result).resolves.toBe(true)
  })
})
