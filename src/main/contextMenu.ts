import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

export interface ContextMenuPlan {
  keyPath: string
  commandKeyPath: string
  label: string
  command: string
  icon: string
}

export function buildContextMenuPlan(exePath: string): ContextMenuPlan {
  const keyPath = 'HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes'
  return {
    keyPath,
    commandKeyPath: `${keyPath}\\command`,
    label: 'Open with Notes & Codes',
    command: `"${exePath}" "%1"`,
    icon: `"${exePath}",0`
  }
}

export type ContextMenuAction = { kind: 'write' } | { kind: 'skip'; notice: string }

/**
 * Should a context-menu toggle actually reach the registry?
 *
 * MUST be gated on app.isPackaged, for the same reason setLoginItem and the packaged-startup
 * re-apply are: in a dev run `app.getPath('exe')` is Electron's own binary, so honouring the
 * toggle would rewrite the developer's REAL `HKCU\Software\Classes\*\shell\NotesAndCodes` to
 * launch a bare electron.exe out of node_modules. Note both directions are destructive — a
 * dev-run *disable* runs `reg delete` and removes the real installed entry outright — so the
 * gate deliberately ignores `enabled` and skips either way.
 *
 * Pure + DI'd so it can be unit-tested without electron and without any test ever touching
 * HKCU (which would mutate the developer's own shell integration). `enabled` is taken but
 * unused on purpose: it keeps the call shape honest and lets the tests pin that BOTH
 * directions are gated, which is the half that's easy to forget.
 */
export function contextMenuAction(enabled: boolean, isPackaged: boolean): ContextMenuAction {
  if (!isPackaged) {
    return { kind: 'skip', notice: 'The right-click menu entry applies to the installed app, not a dev run.' }
  }
  return { kind: 'write' }
}

export async function setContextMenu(enabled: boolean, exePath: string): Promise<void> {
  const plan = buildContextMenuPlan(exePath)
  try {
    if (enabled) {
      await run('reg', ['add', plan.keyPath, '/ve', '/d', plan.label, '/f'])
      await run('reg', ['add', plan.commandKeyPath, '/ve', '/d', plan.command, '/f'])
      // Icon last, deliberately: it's the cosmetic value. If this one throws, the label and
      // command are already written, so the menu entry still WORKS (just without its icon).
      // Writing it earlier would let an icon failure skip the command write and leave a
      // menu entry that does nothing.
      await run('reg', ['add', plan.keyPath, '/v', 'Icon', '/d', plan.icon, '/f'])
    } else {
      await run('reg', ['delete', plan.keyPath, '/f']).catch(() => {})
    }
  } catch (err) {
    console.error('context menu update failed', err)
  }
}
