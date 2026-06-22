import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileForEditor, writeFile, detectEol } from '../../src/main/fileService'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-file-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('fileService', () => {
  it('detects CRLF vs LF', () => {
    expect(detectEol('a\r\nb')).toBe('CRLF')
    expect(detectEol('a\nb')).toBe('LF')
    expect(detectEol('nolinebreak')).toBe('LF')
  })
  it('reads a file and reports eol', async () => {
    const p = join(dir, 'f.txt'); writeFileSync(p, 'x\r\ny')
    const r = await readFileForEditor(p)
    expect(r.content).toBe('x\r\ny')
    expect(r.eol).toBe('CRLF')
    expect(r.filePath).toBe(p)
  })
  it('writes with the requested eol', async () => {
    const p = join(dir, 'out.txt')
    await writeFile(p, 'a\nb', 'CRLF')
    expect(readFileSync(p, 'utf8')).toBe('a\r\nb')
  })
})
