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
  })
  it('reads a utf8 file and reports encoding+eol', async () => {
    const p = join(dir, 'f.txt'); writeFileSync(p, 'x\r\ny')
    const r = await readFileForEditor(p)
    expect(r.content).toBe('x\r\ny'); expect(r.eol).toBe('CRLF'); expect(r.encoding).toBe('utf8')
  })
  it('reads a utf16le BOM file', async () => {
    const p = join(dir, 'u.txt')
    writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))
    const r = await readFileForEditor(p)
    expect(r.content).toBe('hi'); expect(r.encoding).toBe('utf16le')
  })
  it('writes with the requested eol and encoding', async () => {
    const p = join(dir, 'out.txt')
    await writeFile(p, 'a\nb', 'CRLF', 'utf8bom')
    const raw = readFileSync(p)
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]) // BOM
    expect(raw.subarray(3).toString('utf8')).toBe('a\r\nb')
  })
})
