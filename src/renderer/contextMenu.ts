import { OverlayRegistration } from './overlayManager'
import { moveRovingIndex } from './rovingIndex'

export interface ContextMenuItem { label: string; run: () => void; disabled?: boolean; checked?: boolean }
/** A menu row, or a hairline between groups. */
export type ContextMenuEntry = ContextMenuItem | { separator: true }
export interface ContextMenuOptions {
  opener?: HTMLElement | null
  focusFirst?: boolean
}

type MenuKeyEvent = Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>

/** Handles only menu-local keys; Escape remains exclusively owned by overlayManager. */
export function handleContextMenuKey(
  event: MenuKeyEvent,
  move: (key: string) => void,
  activate: () => void,
): void {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); move(event.key); return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault(); activate()
  }
}

const overlay = new OverlayRegistration()
let closeCurrent: (() => void) | null = null

export function closeContextMenu(): void { closeCurrent?.() }

// A small themed popup menu. Themed (CSS tokens) + z-index:100 per the overlay convention —
// not Electron's native menu, for visual consistency with the app's overlays.
export function showContextMenu(
  x: number,
  y: number,
  items: ContextMenuEntry[],
  options: ContextMenuOptions = {},
): void {
  closeContextMenu()
  const menu = document.createElement('div')
  menu.id = 'ctx-menu'
  menu.setAttribute('role', 'menu')
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  for (const item of items) {
    if ('separator' in item) {
      const sep = document.createElement('div')
      sep.className = 'ctx-sep'
      sep.setAttribute('role', 'separator')
      menu.appendChild(sep)
      continue
    }
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'ctx-item'
    row.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio')
    if (item.checked !== undefined) row.setAttribute('aria-checked', String(item.checked))
    row.tabIndex = -1
    row.disabled = item.disabled ?? false
    row.textContent = item.label
    row.onclick = () => { close(); item.run() }
    menu.appendChild(row)
  }
  let closed = false
  let outsideClickTimer: number | null = null
  function close(): void {
    if (closed) return
    closed = true
    if (outsideClickTimer !== null) window.clearTimeout(outsideClickTimer)
    menu.removeEventListener('keydown', onMenuKeyDown)
    window.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('blur', close)
    if (closeCurrent === close) {
      closeCurrent = null
      overlay.release()
    }
    menu.remove()
    if (options.focusFirst && options.opener?.isConnected &&
      !options.opener.matches(':disabled') && options.opener.getAttribute('aria-disabled') !== 'true') {
      options.opener.focus()
    }
  }
  function onDown(e: MouseEvent): void { if (!menu.contains(e.target as Node)) close() }
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) close()
  }
  function move(key: string): void {
    const rows = [...menu.querySelectorAll<HTMLButtonElement>('.ctx-item')]
    const next = moveRovingIndex(
      Math.max(0, rows.indexOf(document.activeElement as HTMLButtonElement)),
      rows.map(row => !row.disabled), key, 'vertical',
    )
    if (next !== null) {
      for (const [index, row] of rows.entries()) row.tabIndex = index === next ? 0 : -1
      rows[next].focus()
    }
  }
  function onMenuKeyDown(event: KeyboardEvent): void {
    handleContextMenuKey(event, move, () => {
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click()
    })
  }
  document.body.appendChild(menu)
  closeCurrent = close
  overlay.open(close)   // Escape closes it via overlayManager
  menu.addEventListener('keydown', onMenuKeyDown)
  if (options.focusFirst) move('Home')
  // defer so the right-click that opened it doesn't immediately close it
  outsideClickTimer = window.setTimeout(() => window.addEventListener('mousedown', onDown, true), 0)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', close)
}
