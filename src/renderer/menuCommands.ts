export function installMenuCommands(map: Record<string, () => void>, onTheme?: (id: string) => void): void {
  window.api.onMenuCommand((id) => {
    if (onTheme && id.startsWith('theme:')) { onTheme(id.slice(6)); return }
    map[id]?.()
  })
}
