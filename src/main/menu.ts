import { app, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { THEME_LIST } from '../renderer/themes'

export interface MenuDeps {
  send: (id: string) => void
  requestQuit: () => void
  recent: string[]
  openRecent: (path: string) => void
  clearRecent: () => void
}

export function buildMenu(d: MenuDeps): void {
  const cmd = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions =>
    ({ label, accelerator, click: () => d.send(id) })
  const recentItems: MenuItemConstructorOptions[] = d.recent.length
    ? [...d.recent.map(p => ({ label: p, click: () => d.openRecent(p) })),
       { type: 'separator' as const }, { label: 'Clear Recent', click: () => d.clearRecent() }]
    : [{ label: '(none)', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    { label: 'File', submenu: [
      cmd('New Tab', 'new', 'CmdOrCtrl+T'),
      cmd('Open…', 'open', 'CmdOrCtrl+O'),
      { label: 'Open Recent', submenu: recentItems },
      { type: 'separator' },
      cmd('Save', 'save', 'CmdOrCtrl+S'),
      cmd('Save As…', 'save-as', 'CmdOrCtrl+Shift+A'),
      cmd('Save All', 'save-all', 'CmdOrCtrl+Shift+S'),
      cmd('Close Tab', 'close', 'CmdOrCtrl+W'),
      { type: 'separator' },
      { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => d.requestQuit() }
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      { type: 'separator' }, cmd('Find', 'find'), cmd('Replace', 'replace')
    ] },
    { label: 'View', submenu: [
      cmd('Toggle Split', 'split'),
      cmd('Toggle Markdown Preview', 'mdpreview'),
      cmd('Toggle Word Wrap', 'wrap'),
      cmd('Toggle Line Numbers', 'lines'),
      { type: 'separator' },
      cmd('Zoom In', 'zoom-in', 'CmdOrCtrl+='),
      cmd('Zoom Out', 'zoom-out', 'CmdOrCtrl+-'),
      cmd('Reset Zoom', 'zoom-reset', 'CmdOrCtrl+0'),
      { type: 'separator' },
      cmd('Appearance…', 'appearance'),
      { label: 'Theme', submenu: THEME_LIST.map(t => ({ label: t.label, click: () => d.send('theme:' + t.id) })) },
      cmd('Always on Top', 'aot')
    ] },
    { label: 'Tools', submenu: [
      cmd('Diff: tab vs tab', 'diff'),
      cmd('Diff: current vs clipboard', 'diff-clip'),
      cmd('Diff: two files', 'diff-files'),
      { type: 'separator' },
      cmd('File History', 'history'),
      { type: 'separator' },
      cmd('Paste from History', 'paste-history'),
      cmd('Insert Snippet', 'snip-insert'),
      cmd('Save Selection as Snippet', 'snip-save'),
      cmd('Manage Snippets', 'snip-manage'),
      { type: 'separator' },
      cmd('Toggle "Open with" right-click menu', 'ctxmenu')
    ] },
    { label: 'Help', submenu: [
      { label: 'Open README', click: () => shell.openExternal('https://github.com/NetworkMD87/Notes-and-codes#readme') },
      { label: `About Notes & Codes ${app.getVersion()}`, enabled: false }
    ] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
