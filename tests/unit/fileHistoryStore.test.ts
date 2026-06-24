import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { FileHistoryStore } from '../../src/main/fileHistoryStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-hist-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('FileHistoryStore', () => {
  it('missing → empty list', async () => {
    expect(await new FileHistoryStore(dir).list('C:/x.txt')).toEqual([])
  })
  it('snapshot appends; list is newest-first metadata', async () => {
    const s = new FileHistoryStore(dir)
    await s.snapshot('C:/a.txt', 'one', 'LF', 'utf8')
    await s.snapshot('C:/a.txt', 'two', 'LF', 'utf8')
    const list = await s.list('C:/a.txt')
    expect(list).toHaveLength(2)
    expect(list[0].ts).toBeGreaterThanOrEqual(list[1].ts)
  })
  it('dedups identical-to-latest content', async () => {
    const s = new FileHistoryStore(dir)
    await s.snapshot('C:/a.txt', 'same', 'LF', 'utf8')
    await s.snapshot('C:/a.txt', 'same', 'LF', 'utf8')
    expect(await s.list('C:/a.txt')).toHaveLength(1)
  })
  it('prunes to cap, dropping oldest', async () => {
    const s = new FileHistoryStore(dir, 3)
    for (const c of ['a', 'b', 'c', 'd', 'e']) await s.snapshot('C:/a.txt', c, 'LF', 'utf8')
    const list = await s.list('C:/a.txt')
    expect(list).toHaveLength(3)
    expect((await s.get('C:/a.txt', list[0].ts))?.content).toBe('e')
  })
  it('get returns content/eol/encoding; missing ts → null', async () => {
    const s = new FileHistoryStore(dir)
    await s.snapshot('C:/a.txt', 'hello', 'CRLF', 'utf8bom')
    const list = await s.list('C:/a.txt')
    const v = await s.get('C:/a.txt', list[0].ts)
    expect(v?.content).toBe('hello'); expect(v?.eol).toBe('CRLF'); expect(v?.encoding).toBe('utf8bom')
    expect(await s.get('C:/a.txt', 999999)).toBeNull()
  })
  it('corrupt history file → empty', async () => {
    const s = new FileHistoryStore(dir)
    await s.snapshot('C:/a.txt', 'x', 'LF', 'utf8')
    mkdirSync(join(dir, 'file-history'), { recursive: true })
    writeFileSync(join(dir, 'file-history', createHash('sha256').update('C:/a.txt').digest('hex') + '.json'), '{bad')
    expect(await s.list('C:/a.txt')).toEqual([])
  })
})
