import { OverlayRegistration } from './overlayManager'

export interface ContextMenuItem { label: string; run: () => void }
/** A menu row, or a hairline between groups. */
export type ContextMenuEntry = ContextMenuItem | { separator: true }

const overlay = new OverlayRegistration()
let closeCurrent: (() => void) | null = null

export function closeContextMenu(): void { closeCurrent?.() }

// A small themed popup menu. Themed (CSS tokens) + z-index:100 per the overlay convention —
// not Electron's native menu, for visual consistency with the app's overlays.
export function showContextMenu(x: number, y: number, items: ContextMenuEntry[]): void {
  closeContextMenu()
  const menu = document.createElement('div')
  menu.id = 'ctx-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  for (const item of items) {
    if ('separator' in item) {
      const sep = document.createElement('div')
      sep.className = 'ctx-sep'
      menu.appendChild(sep)
      continue
    }
    const row = document.createElement('div')
    row.className = 'ctx-item'
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
    if (closeCurrent === close) {
      closeCurrent = null
      overlay.release()
    }
    menu.remove()
    window.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('blur', close)
  }
  function onDown(e: MouseEvent): void { if (!menu.contains(e.target as Node)) close() }
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) close()
  }
  document.body.appendChild(menu)
  closeCurrent = close
  overlay.open(close)   // Escape closes it via overlayManager
  // defer so the right-click that opened it doesn't immediately close it
  outsideClickTimer = window.setTimeout(() => window.addEventListener('mousedown', onDown, true), 0)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', close)
}
