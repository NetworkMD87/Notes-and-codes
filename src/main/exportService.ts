import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'
import { writeFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { atomicWrite } from './atomicWrite'
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
    // Atomic: overwriting an existing export must not truncate the previous good copy
    // if the write is interrupted (same guarantee as the JSON stores).
    await atomicWrite(r.filePath, html)
    return { ok: true, path: r.filePath }
  } catch (e) {
    console.error('[export] saveHtml failed', e)
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
  // Render via a temp file + loadFile rather than a data: URL — data: URLs hit Chromium's
  // ~2 MB ceiling, silently failing large documents.
  const tmpHtml = join(tmpdir(), `nc-export-${process.pid}-${Date.now()}.html`)
  try {
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await writeFile(tmpHtml, html, 'utf8')
    await win.loadFile(tmpHtml)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await atomicWrite(r.filePath, pdf) // atomicWrite accepts a Buffer (encoding ignored)
    return { ok: true, path: r.filePath }
  } catch (e) {
    console.error('[export] savePdf failed', e)
    return { ok: false }
  } finally {
    win?.destroy()
    await unlink(tmpHtml).catch(() => {})
  }
}
