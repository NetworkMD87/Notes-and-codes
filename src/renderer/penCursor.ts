import { HL_HEX, type HighlightColour } from '../shared/types'

// Chisel-marker artwork on a 32x32 canvas — the largest cursor size Windows renders without
// scaling. Deliberately NOT the toolbar's ICONS.highlighter outline: four thin strokes plus a
// halo fuse into a smudge at cursor size (rejected at the 2026-07-20 installer eyeball), so the
// pen is two solid shapes instead — a dark barrel and a colour-filled chisel tip.
const BARREL = 'M12.7 16.7 L22.7 6.7 L26.7 10.7 L16.7 20.7 Z'
const TIP = 'M12.7 16.7 L16.7 20.7 L4.7 27.3 Z'
const SHAPES = `<path d="${BARREL}"/><path d="${TIP}"/>`

/**
 * 32x32 chisel marker: wide white halo, dark barrel, colour-filled tip, thin dark outline. The
 * fixed two-tone body keeps the cursor visible on every theme without being repainted when the
 * theme changes. `xmlns` is required — an SVG used as an image (not inline DOM) will not render
 * without it.
 */
function markerSvg(hex: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">'
    + `<g fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">${SHAPES}</g>`
    + `<path d="${BARREL}" fill="#3f4652"/><path d="${TIP}" fill="${hex}"/>`
    + `<g fill="none" stroke="#1f2937" stroke-width="1.6" stroke-linejoin="round">${SHAPES}</g>`
    + '</svg>'
}

/**
 * CSS `cursor` value for the highlighter pen in `colour`. Hotspot 5 27 = the chisel point in the
 * 32x32 viewBox, so a stroke starts where the tip touches. Falls back to `crosshair` (the pre-1.13
 * cursor) if the image cannot be decoded. Percent-encoding is load-bearing: a raw `#` from the hex
 * would terminate the data URI as a fragment.
 */
export function penCursor(colour: HighlightColour): string {
  return `url("data:image/svg+xml,${encodeURIComponent(markerSvg(HL_HEX[colour]))}") 5 27, crosshair`
}
