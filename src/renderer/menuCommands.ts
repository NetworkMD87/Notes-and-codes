export function installMenuCommands(map: Record<string, () => void>): void {
  window.api.onMenuCommand((id) => { const fn = map[id]; if (fn) fn() })
}
