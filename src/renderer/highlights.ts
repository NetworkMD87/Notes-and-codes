import type { Highlight, HighlightColour } from '../shared/types'

export const HIGHLIGHT_COLOURS: HighlightColour[] = ['yellow', 'green', 'blue', 'pink']

/** Remove [start,end) from every segment, splitting/trimming overlaps. */
function subtract(hs: Highlight[], start: number, end: number): Highlight[] {
  const out: Highlight[] = []
  for (const h of hs) {
    if (h.end <= start || h.start >= end) { out.push(h); continue }     // no overlap
    if (h.start < start) out.push({ start: h.start, end: start, colour: h.colour }) // left remainder
    if (h.end > end) out.push({ start: end, end: h.end, colour: h.colour })         // right remainder
  }
  return out
}

/** Is [start,end) fully covered by segments of `colour`? */
function fullyCovered(hs: Highlight[], start: number, end: number, colour: HighlightColour): boolean {
  const segs = hs.filter(h => h.colour === colour && h.end > start && h.start < end)
    .sort((a, b) => a.start - b.start)
  let cursor = start
  for (const s of segs) {
    if (s.start > cursor) return false
    cursor = Math.max(cursor, s.end)
    if (cursor >= end) return true
  }
  return cursor >= end
}

/** Sort and merge touching/overlapping same-colour segments. */
function normalize(hs: Highlight[]): Highlight[] {
  const sorted = hs.filter(h => h.end > h.start).sort((a, b) => a.start - b.start)
  const out: Highlight[] = []
  for (const h of sorted) {
    const last = out[out.length - 1]
    if (last && last.colour === h.colour && h.start <= last.end) last.end = Math.max(last.end, h.end)
    else out.push({ ...h })
  }
  return out
}

export function applyStroke(existing: Highlight[], range: { start: number; end: number }, colour: HighlightColour): Highlight[] {
  const { start, end } = range
  if (end <= start) return existing
  if (fullyCovered(existing, start, end, colour)) return normalize(subtract(existing, start, end)) // erase
  return normalize([...subtract(existing, start, end), { start, end, colour }])                    // paint
}

export function clampToLength(hs: Highlight[], len: number): Highlight[] {
  const out: Highlight[] = []
  for (const h of hs) {
    const start = Math.max(0, h.start)
    const end = Math.min(h.end, len)
    if (end > start) out.push({ start, end, colour: h.colour })
  }
  return out
}
