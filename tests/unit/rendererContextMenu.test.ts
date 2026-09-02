// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContextMenu, handleContextMenuKey, showContextMenu } from '../../src/renderer/contextMenu'
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

  it('renders menu semantics and skips disabled rows during wrapped navigation', () => {
    const run = vi.fn()
    showContextMenu(10, 20, [
      { label: 'First', run }, { separator: true },
      { label: 'Disabled', disabled: true, run: vi.fn() },
      { label: 'Last', run },
    ], { focusFirst: true })
    const menu = document.querySelector<HTMLElement>('#ctx-menu')!
    expect(menu.getAttribute('role')).toBe('menu')
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(document.activeElement).toBe(items[0])
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(items[2])
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(items[0])
    expect(menu.querySelector('[role="separator"]')).not.toBeNull()
  })

  it('renders checked choices as keyboard-navigable menuitemradio rows', () => {
    showContextMenu(0, 0, [
      { label: 'Side by side', checked: false, run: vi.fn() },
      { label: 'Focus', checked: true, run: vi.fn() },
      { label: 'Off', checked: false, run: vi.fn() },
    ], { focusFirst: true })

    const rows = [...document.querySelectorAll<HTMLButtonElement>('.ctx-item')]
    expect(rows.map(row => row.getAttribute('role'))).toEqual([
      'menuitemradio', 'menuitemradio', 'menuitemradio',
    ])
    expect(rows.map(row => row.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    document.querySelector('#ctx-menu')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', bubbles: true,
    }))
    expect(document.activeElement).toBe(rows[1])
  })

  it('activates with Enter or Space and restores a connected keyboard opener', () => {
    const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
    const run = vi.fn()
    showContextMenu(0, 0, [{ label: 'Open', run }], { opener, focusFirst: true })
    const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(run).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(opener)

    const spaceRun = vi.fn()
    showContextMenu(0, 0, [{ label: 'Open with Space', run: spaceRun }], { opener, focusFirst: true })
    document.querySelector<HTMLButtonElement>('[role="menuitem"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(spaceRun).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(opener)
  })

  it('uses Home and End then closes idempotently', () => {
    showContextMenu(0, 0, [
      { label: 'First', run: vi.fn() },
      { label: 'Disabled', disabled: true, run: vi.fn() },
      { label: 'Last', run: vi.fn() },
    ], { focusFirst: true })
    const menu = document.querySelector<HTMLElement>('#ctx-menu')!
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(items[2])
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(items[0])
    closeContextMenu()
    closeContextMenu()
    expect(document.querySelector('#ctx-menu')).toBeNull()
    expect(openCount()).toBe(start)
  })

  it('leaves Escape untouched for the central overlay manager', () => {
    const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const move = vi.fn(); const activate = vi.fn()
    handleContextMenuKey(event, move, activate)
    expect(move).not.toHaveBeenCalled()
    expect(activate).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.stopPropagation).not.toHaveBeenCalled()
  })
})
