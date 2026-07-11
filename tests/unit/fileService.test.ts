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
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.file.content).toBe('x\r\ny'); expect(r.file.eol).toBe('CRLF'); expect(r.file.encoding).toBe('utf8')
  })
  it('reads a utf16le BOM file', async () => {
    const p = join(dir, 'u.txt')
    writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))
    const r = await readFileForEditor(p)
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.file.content).toBe('hi'); expect(r.file.encoding).toBe('utf16le')
  })
  it('refuses a file over the size limit', async () => {
    const p = join(dir, 'big.txt'); writeFileSync(p, 'x'.repeat(100))
    const r = await readFileForEditor(p, 50) // 50-byte limit for the test
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/too large/i)
  })
  it('refuses a binary file (NUL bytes, no BOM)', async () => {
    const p = join(dir, 'bin.dat'); writeFileSync(p, Buffer.from([0x41, 0x00, 0x42, 0x00, 0x01]))
    const r = await readFileForEditor(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/binary/i)
  })
  it('still opens a BOM-marked utf16 file that contains NUL bytes', async () => {
    // UTF-16 legitimately has NUL bytes; the BOM proves it is text, so it must NOT be
    // mistaken for a binary file.
    const p = join(dir, 'u16.txt')
    writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hello', 'utf16le')]))
    const r = await readFileForEditor(p)
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.file.content).toBe('hello')
  })
  it('writes with the requested eol and encoding', async () => {
    const p = join(dir, 'out.txt')
    await writeFile(p, 'a\nb', 'CRLF', 'utf8bom')
    const raw = readFileSync(p)
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]) // BOM
    expect(raw.subarray(3).toString('utf8')).toBe('a\r\nb')
  })
})
