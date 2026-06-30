import { nativeImage, type NativeImage } from 'electron'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { TRAY_PNG_DARK_BG_BASE64, TRAY_PNG_LIGHT_BG_BASE64 } from './trayImage'

/**
 * Does the Windows *taskbar* (and therefore the tray) use the light theme? This is the
 * `SystemUsesLightTheme` value, which is independent of the apps theme that Electron's
 * `nativeTheme.shouldUseDarkColors` reflects — the user can run light apps on a dark
 * taskbar or vice versa, and small icons must contrast with the taskbar specifically.
 * Defaults to dark (the Windows 11 default, and the safe assumption elsewhere).
 */
export function taskbarUsesLightTheme(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', '/v', 'SystemUsesLightTheme'],
      { encoding: 'utf8', windowsHide: true }
    )
    const m = out.match(/SystemUsesLightTheme\s+REG_DWORD\s+0x([0-9a-f]+)/i)
    return m ? parseInt(m[1], 16) === 1 : false
  } catch {
    return false
  }
}

/**
 * The `{&}` glyph tinted to contrast with the current taskbar theme. Used for BOTH the
 * system tray and the live window/taskbar button, so every small icon reads clearly
 * (the full `{N&C}` mark is illegible below ~48px). Light taskbar → dark glyph; dark
 * taskbar → bright glyph.
 */
export function glyphImage(): NativeImage {
  const b64 = taskbarUsesLightTheme() ? TRAY_PNG_LIGHT_BG_BASE64 : TRAY_PNG_DARK_BG_BASE64
  return nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))
}
