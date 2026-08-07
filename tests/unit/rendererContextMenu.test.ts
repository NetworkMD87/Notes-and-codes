// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showContextMenu } from '../../src/renderer/contextMenu'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const esc = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })

describe('showContextMenu', () => {
  const start = openCount()
  afterEach(() => {
    while (openCount() > start) esc()
    document.body.replaceChildren()
  })

  it('replaces an open menu without orphaning an overlay registration', () => {
    showContextMenu(10, 20, [{ label: 'First', run: vi.fn() }])
    showContextMenu(30, 40, [{ label: 'Second', run: vi.fn() }])
    expect(document.querySelectorAll('#ctx-menu')).toHaveLength(1)
    expect(document.querySelector('#ctx-menu')?.textContent).toBe('Second')
    expect(openCount()).toBe(start + 1)
    esc()
    expect(document.querySelector('#ctx-menu')).toBeNull()
    expect(openCount()).toBe(start)
  })
})
