// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContextMenu, handleContextMenuKey, showContextMenu } from '../../src/renderer/contextMenu'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const esc = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })

describe('showContextMenu', () => {
  const start = openCount()
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  afterEach(() => {
    while (openCount() > start) esc()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height })
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

  it('flips toward available space and clamps the menu within an eight-pixel viewport gap', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 80, width: 100, height: 80,
      toJSON: () => ({}),
    } as DOMRect)
    showContextMenu(290, 190, [{ label: 'Edge', run: vi.fn() }])
    const positioned = document.querySelector<HTMLElement>('#ctx-menu')!
    expect(positioned.style.left).toBe('190px')
    expect(positioned.style.top).toBe('110px')
    closeContextMenu()
    showContextMenu(10, 190, [{ label: 'Bottom left', run: vi.fn() }])
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.left).toBe('10px')
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.top).toBe('110px')
    closeContextMenu()
    showContextMenu(10, 10, [{ label: 'Top left', run: vi.fn() }])
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.left).toBe('10px')
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.top).toBe('10px')
    closeContextMenu()
    showContextMenu(-40, -20, [{ label: 'Clamped', run: vi.fn() }])
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.left).toBe('8px')
    expect(document.querySelector<HTMLElement>('#ctx-menu')!.style.top).toBe('8px')
  })

  it('scrolls the newly focused keyboard row into view and closes on window resize', () => {
    showContextMenu(10, 20, [
      { label: 'First', run: vi.fn() }, { label: 'Second', run: vi.fn() },
    ], { focusFirst: true })
    const menu = document.querySelector<HTMLElement>('#ctx-menu')!
    const second = menu.querySelectorAll<HTMLButtonElement>('.ctx-item')[1]
    const scrollIntoView = vi.fn()
    second.scrollIntoView = scrollIntoView
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(second)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    window.dispatchEvent(new Event('resize'))
    expect(document.querySelector('#ctx-menu')).toBeNull()
    expect(openCount()).toBe(start)
  })

  it('uses untransformed layout dimensions and rounds fractional bounds outward', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 200 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 90, height: 70 } as DOMRect)
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '100.2px', height: '80.2px' } as CSSStyleDeclaration)
    showContextMenu(290, 190, [{ label: 'Layout size', run: vi.fn() }])
    const menu = document.querySelector<HTMLElement>('#ctx-menu')!
    expect(menu.style.left).toBe('189px')
    expect(menu.style.top).toBe('109px')
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
    const markers = rows.map(row => row.querySelector<HTMLElement>('.ctx-check'))
    expect(markers.every(marker => marker !== null)).toBe(true)
    expect(markers.map(marker => marker?.textContent)).toEqual(['', '✓', ''])
    expect(markers.map(marker => marker?.getAttribute('aria-hidden'))).toEqual(['true', 'true', 'true'])
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
