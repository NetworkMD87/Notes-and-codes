import { promises as fs } from 'node:fs'
import type { EolMode, OpenedFile, Encoding } from '../shared/types'
import { detectEncoding, decode, encode } from './encoding'

export function detectEol(content: string): EolMode {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

export async function readFileForEditor(path: string): Promise<OpenedFile> {
  const buf = await fs.readFile(path)
  const encoding = detectEncoding(buf)
  const content = decode(buf, encoding)
  return { filePath: path, content, eol: detectEol(content), encoding }
}

export async function writeFile(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void> {
  const normalized = content.replace(/\r\n/g, '\n')
  const withEol = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await fs.writeFile(path, encode(withEol, encoding))
}
