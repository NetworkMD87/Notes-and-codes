import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWrite } from '../../src/main/atomicWrite'

describe('atomicWrite', () => {
  let dir: string
  beforeEach(async () => { dir = await fs.mkdtemp(join(tmpdir(), 'nc-atomic-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  it('writes a new file', async () => {
    const f = join(dir, 'a.json')
    await atomicWrite(f, '{"x":1}')
    expect(await fs.readFile(f, 'utf8')).toBe('{"x":1}')
  })

  it('overwrites an existing file', async () => {
    const f = join(dir, 'b.txt')
    await atomicWrite(f, 'first')
    await atomicWrite(f, 'second')
    expect(await fs.readFile(f, 'utf8')).toBe('second')
  })

  it('leaves no .tmp file behind', async () => {
    const f = join(dir, 'c.txt')
    await atomicWrite(f, 'data')
    await expect(fs.access(f + '.tmp')).rejects.toThrow()
  })

  it('writes binary (Buffer) data', async () => {
    const f = join(dir, 'd.bin')
    const buf = Buffer.from([0, 1, 2, 255])
    await atomicWrite(f, buf)
    expect(Buffer.compare(await fs.readFile(f), buf)).toBe(0)
  })
})
