import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ExportResult } from '../shared/types'

function defaultPath(sourcePath: string | null, suggestedName: string): string {
  return sourcePath ? join(dirname(sourcePath), suggestedName) : suggestedName
}

function pickPath(parent: BrowserWindow | null, opts: SaveDialogOptions) {
  return parent ? dialog.showSaveDialog(parent, opts) : dialog.showSaveDialog(opts)
}

export async function saveHtml(
  parent: BrowserWindow | null, html: string, suggestedName: string, sourcePath: string | null
): Promise<ExportResult> {
  const r = await pickPath(parent, {
    title: 'Export to HTML',
    defaultPath: defaultPath(sourcePath, suggestedName),
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (r.canceled || !r.filePath) return { ok: true, canceled: true }
  try {
    await writeFile(r.filePath, html, 'utf8')
    return { ok: true, path: r.filePath }
  } catch {
    return { ok: false }
  }
}

export async function savePdf(
  parent: BrowserWindow | null, html: string, suggestedName: string, sourcePath: string | null
): Promise<ExportResult> {
  const r = await pickPath(parent, {
    title: 'Export to PDF',
    defaultPath: defaultPath(sourcePath, suggestedName),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (r.canceled || !r.filePath) return { ok: true, canceled: true }
  let win: BrowserWindow | null = null
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await writeFile(r.filePath, pdf)
    return { ok: true, path: r.filePath }
  } catch {
    return { ok: false }
  } finally {
    win?.destroy()
  }
}
