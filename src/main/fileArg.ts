/**
 * Pick the file-to-open argument out of a process argv. Pure + dependency-injected so it
 * can be unit-tested without electron or the real filesystem: the caller passes
 * `app.isPackaged` and an `exists` predicate (`fs.existsSync` in production).
 *
 * Packaged:   argv = [exe, ...args]
 * Unpackaged: argv = [electronExe, entryScript, ...args]  (dev / `electron <script>`)
 *
 * The heuristic prefers the last path-like arg that actually **exists on disk** — the
 * existence check makes it exact, so a stray Chromium switch value that merely looks like
 * a path can't be mistaken for the file to open. If nothing exists it degrades to the old
 * behaviour (last path-like arg) so there's no regression for edge cases.
 */
export function pickFileArg(
  argv: string[],
  isPackaged: boolean,
  exists: (p: string) => boolean
): string | null {
  const args = isPackaged ? argv.slice(1) : argv.slice(2)
  const looksLikePath = (a: string) => !a.startsWith('-') && /[\\/.]/.test(a)
  const reversed = [...args].reverse()
  return reversed.find(a => looksLikePath(a) && exists(a))
    ?? reversed.find(looksLikePath)
    ?? null
}
