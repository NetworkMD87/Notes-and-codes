import { Tray, Menu, nativeImage } from 'electron'
import { Buffer } from 'node:buffer'
import { TRAY_PNG_BASE64 } from './trayImage'

export function createTray(deps: { onShow: () => void; onQuit: () => void }): Tray {
  const img = nativeImage.createFromBuffer(Buffer.from(TRAY_PNG_BASE64, 'base64'))
  const tray = new Tray(img)
  tray.setToolTip('Notes & Codes')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Notes & Codes', click: deps.onShow },
    { type: 'separator' },
    { label: 'Quit', click: deps.onQuit }
  ]))
  tray.on('click', deps.onShow)
  return tray
}
