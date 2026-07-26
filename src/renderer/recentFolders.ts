/** Pure helpers for the recent-folders UI — no DOM, no `window.api`, so they stay unit-testable
 *  (the repo's split: pure logic is unit-tested, DOM/Monaco modules are smoke-tested). */

/** Split a folder root into its display parts. `name` is the basename, `parent` is everything
 *  above it (empty for a bare drive root). No `node:path` — the renderer is sandboxed — so this
 *  splits on either separator and re-joins with whichever style the input used. */
export function splitPath(path: string): { name: string; parent: string } {
  const sep = path.includes('\\') ? '\\' : '/'
  const segs = path.split(/[\\/]/).filter(Boolean)
  const name = segs.pop() ?? path
  return { name, parent: segs.join(sep) }
}

/** Entries for the sidebar-header switcher: the recents minus the folder that is already open.
 *  Case-folded, because the same Windows folder can be stored with different casing. */
export function menuEntries(recents: string[], current: string | null): string[] {
  if (!current) return recents
  const c = current.toLowerCase()
  return recents.filter(p => p.toLowerCase() !== c)
}
