import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

export interface ContextMenuPlan {
  keyPath: string
  commandKeyPath: string
  label: string
  command: string
}

export function buildContextMenuPlan(exePath: string): ContextMenuPlan {
  const keyPath = 'HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes'
  return {
    keyPath,
    commandKeyPath: `${keyPath}\\command`,
    label: 'Open with Notes & Codes',
    command: `"${exePath}" "%1"`
  }
}

export async function setContextMenu(enabled: boolean, exePath: string): Promise<void> {
  const plan = buildContextMenuPlan(exePath)
  try {
    if (enabled) {
      await run('reg', ['add', plan.keyPath, '/ve', '/d', plan.label, '/f'])
      await run('reg', ['add', plan.commandKeyPath, '/ve', '/d', plan.command, '/f'])
    } else {
      await run('reg', ['delete', plan.keyPath, '/f']).catch(() => {})
    }
  } catch (err) {
    console.error('context menu update failed', err)
  }
}
