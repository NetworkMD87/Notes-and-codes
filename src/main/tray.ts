import { Tray, Menu, nativeTheme } from 'electron'
import { glyphImage } from './themeIcon'

export function createTray(deps: { onShow: () => void; onQuit: () => void }): Tray {
  const tray = new Tray(glyphImage())
  tray.setToolTip('Notes & Codes')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Notes & Codes', click: deps.onShow },
    { type: 'separator' },
    { label: 'Quit', click: deps.onQuit }
  ]))
  tray.on('click', deps.onShow)
  // Re-evaluate the glyph when the OS theme changes (fires on taskbar light/dark switches).
  nativeTheme.on('updated', () => {
    if (!tray.isDestroyed()) tray.setImage(glyphImage())
  })
  return tray
}
