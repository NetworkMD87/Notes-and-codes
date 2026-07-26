// Shared empty-state builder: a muted inline-SVG glyph above a message. Inline SVG is
// DOM markup (not an img-src resource) so it needs no CSP relaxation; it's tinted via
// `currentColor` from the `.empty-glyph` CSS. Paths use a 0 0 24 24 viewBox.
const SVGNS = 'http://www.w3.org/2000/svg'

export const EMPTY_ICONS = {
  // clock — for File History
  history: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7.5v5l3.5 2'],
  // curly braces { } — for Snippets
  snippet: [
    'M8 4c-2 0-3 1-3 3v2c0 1-.7 2-2 2 1.3 0 2 1 2 2v2c0 2 1 3 3 3',
    'M16 4c2 0 3 1 3 3v2c0 1 .7 2 2 2-1.3 0-2 1-2 2v2c0 2-1 3-3 3',
  ],
  // magnifier — for Find in Files
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M16.5 16.5 21 21'],
  // folder — for the no-folder sidebar panel (same silhouette as the sidebar's directory glyph)
  folder: ['M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z'],
}

export function emptyState(className: string, iconPaths: string[], message: string): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = className
  const glyph = document.createElement('div')
  glyph.className = 'empty-glyph'
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  for (const d of iconPaths) {
    const p = document.createElementNS(SVGNS, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  glyph.appendChild(svg)
  wrap.appendChild(glyph)
  const text = document.createElement('div')
  text.textContent = message
  wrap.appendChild(text)
  return wrap
}
