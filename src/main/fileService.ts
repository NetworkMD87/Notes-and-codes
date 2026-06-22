import { promises as fs } from 'node:fs'
import type { EolMode, OpenedFile } from '../shared/types'

export function detectEol(content: string): EolMode {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

export async function readFileForEditor(path: string): Promise<OpenedFile> {
  const content = await fs.readFile(path, 'utf8')
  return { filePath: path, content, eol: detectEol(content) }
}

export async function writeFile(path: string, content: string, eol: EolMode): Promise<void> {
  const normalized = content.replace(/\r\n/g, '\n')
  const out = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await fs.writeFile(path, out, 'utf8')
}
