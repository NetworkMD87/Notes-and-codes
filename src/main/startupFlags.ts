/**
 * Should the window start hidden to the tray?
 *
 * True only for a launch-on-login start: `app.setLoginItemSettings` registers the startup
 * entry with `--hidden`, so the app boots invisible and waits for the summon hotkey or a
 * tray click. Pure + dependency-injected (the caller passes whether a file arg was found)
 * so the precedence rule is unit-testable without electron — same shape as pickFileArg.
 *
 * A file arg always wins: an "Open with" launch must show its file even if `--hidden`
 * somehow rides along in the same argv.
 */
export function shouldStartHidden(argv: string[], hasFileArg: boolean): boolean {
  if (hasFileArg) return false
  return argv.includes('--hidden')
}
