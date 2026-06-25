export interface ContextMenuItem { label: string; run: () => void }

// A small themed popup menu. Themed (CSS tokens) + z-index:100 per the overlay convention —
// not Electron's native menu, for visual consistency with the app's overlays.
export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  document.getElementById('ctx-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'ctx-menu'
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'ctx-item'
    row.textContent = item.label
    row.onclick = () => { close(); item.run() }
    menu.appendChild(row)
  }
  function close(): void {
    menu.remove()
    window.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('blur', close)
  }
  function onDown(e: MouseEvent): void { if (!menu.contains(e.target as Node)) close() }
  document.body.appendChild(menu)
  // defer so the right-click that opened it doesn't immediately close it
  setTimeout(() => window.addEventListener('mousedown', onDown, true), 0)
  window.addEventListener('blur', close)
}
