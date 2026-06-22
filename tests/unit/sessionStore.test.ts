import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../../src/main/sessionStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-sess-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SessionStore', () => {
  it('returns an empty session when nothing saved', async () => {
    const s = new SessionStore(dir)
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })

  it('saves and reloads a session', async () => {
    const s = new SessionStore(dir)
    const data = { buffers: [{ id: 'a', title: 'A', filePath: null, content: 'x', language: 'plaintext', eol: 'LF' as const, dirty: true }], activeId: 'a' }
    await s.save(data)
    expect(await new SessionStore(dir).load()).toEqual(data)
  })

  it('returns empty session on corrupt file', async () => {
    const s = new SessionStore(dir)
    const { writeFileSync, mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, 'session'), { recursive: true })
    writeFileSync(join(dir, 'session', 'session.json'), '{ not json')
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })
})
