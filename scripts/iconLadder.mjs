// Pure: the .ico size ladder and the tile artwork. No I/O, no deps — unit-tested.
// Consumed by scripts/make-icon.mjs.

/** Tile background, sampled from the real nc-icon-256.png at (10,128). */
export const TILE_BG = '#1B1D21'

/** Corner radius as a fraction of tile size (measured 51px of 256 ≈ 19.9%). */
export const TILE_RADIUS = 0.2

/**
 * What artwork each .ico frame carries.
 *
 *   'amp'   — the ampersand alone. At 16px the braces collapse to 1px slivers and the
 *             whole mark turns to mush, so we simplify. Per-size simplification is the
 *             Windows-native pattern.
 *   'glyph' — the full {&}.
 *   'tile'  — the committed {N&C} app-icon PNG, passed through unchanged at the sizes
 *             where the full mark is still legible.
 *
 * `scale` is a fraction of tile WIDTH; the height follows the artwork's own aspect ratio.
 */
export const ICON_LADDER = [
  { size: 16, art: 'amp', scale: 0.55 },
  { size: 24, art: 'glyph', scale: 0.92 },
  { size: 32, art: 'glyph', scale: 0.92 },
  { size: 48, art: 'tile' },
  { size: 256, art: 'tile' }
]

/** The rounded-rect tile every composited frame sits on. */
export function tileSvg(size) {
  const r = size * TILE_RADIUS
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${TILE_BG}"/>` +
    `</svg>`
  )
}
