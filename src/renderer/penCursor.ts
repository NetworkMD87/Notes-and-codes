import { HL_HEX, type HighlightColour } from '../shared/types'

// Marker paths deliberately duplicated from ICONS.highlighter (toolbar.ts): that icon is a 16px
// stroke-only `currentColor` glyph, while this is 24px three-layer artwork that needs the head
// path on its own to fill it separately from the rest. Not a shared constant — keep the two in
// sync by hand if the icon ever changes. HEAD_D is the tip; it gets filled with the active
// colour, the rest stays outline.
const HEAD_D = 'm9 11-6 6v3h3l6-6'
const PATHS = `<path d="${HEAD_D}"/><path d="m17 7 3-3a1.4 1.4 0 0 0-2-2l-3 3"/>`
  + '<path d="m12 8 4 4"/><path d="M9 11l4 4"/>'
const JOIN = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'

/**
 * 24x24 marker: wide white halo, colour-filled head, thin dark outline. The two-tone body keeps
 * the cursor visible on every theme without being repainted when the theme changes.
 * `xmlns` is required — an SVG used as an image (not inline DOM) will not render without it.
 */
function markerSvg(hex: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
    + `<g ${JOIN} stroke="#ffffff" stroke-width="3.5">${PATHS}</g>`
    + `<path d="${HEAD_D}" fill="${hex}"/>`
    + `<g ${JOIN} stroke="#1f2937" stroke-width="1.5">${PATHS}</g>`
    + '</svg>'
}

/**
 * CSS `cursor` value for the highlighter pen in `colour`. Hotspot 3 20 = the tip corner in the
 * 24x24 viewBox, so a stroke starts where the tip touches. Falls back to `crosshair` (the
 * pre-1.13 cursor) if the image cannot be decoded. Percent-encoding is load-bearing: a raw `#`
 * from the hex would terminate the data URI as a fragment.
 */
export function penCursor(colour: HighlightColour): string {
  return `url("data:image/svg+xml,${encodeURIComponent(markerSvg(HL_HEX[colour]))}") 3 20, crosshair`
}
