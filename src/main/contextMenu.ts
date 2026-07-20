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
