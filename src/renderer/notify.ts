export type ToastLevel = 'info' | 'success' | 'warning' | 'error'

const SVGNS = 'http://www.w3.org/2000/svg'

// Inline-SVG glyph path sets (0 0 24 24 viewBox, stroked via currentColor — same convention as
// emptyState.ts). One per level so the map is exhaustive and unit-testable.
export const TOAST_ICONS: Record<ToastLevel, string[]> = {
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
  success: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8.5 12.5l2.5 2.5 4.5-5.5'],
  warning: ['M12 3.5 2.5 20.5h19L12 3.5z', 'M12 10v4', 'M12 17h.01'],
  error: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M15 9l-6 6', 'M9 9l6 6'],
}

// Errors/warnings dwell longer so they aren't missed; info/success are transient.
export const TOAST_MS: Record<ToastLevel, number> = { info: 2200, success: 2200, warning: 3500, error: 3500 }

export function toast(message: string, level: ToastLevel = 'info'): void {
  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'toast toast--' + level
  const glyph = document.createElement('span')
  glyph.className = 'toast-glyph'
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  for (const d of TOAST_ICONS[level]) {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  glyph.appendChild(svg)
  const text = document.createElement('span')
  text.textContent = message
  el.append(glyph, text)
  host.appendChild(el)
  setTimeout(() => el.remove(), TOAST_MS[level])
}
