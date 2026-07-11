import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../../src/main/sessionStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-sess-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function seed(session: unknown): void {
  mkdirSync(join(dir, 'session'), { recursive: true })
  writeFileSync(join(dir, 'session', 'session.json'), JSON.stringify(session))
}

describe('SessionStore', () => {
  it('returns an empty session when nothing saved', async () => {
    const s = new SessionStore(dir)
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })

  it('saves and reloads a session', async () => {
    const s = new SessionStore(dir)
    const data = { buffers: [{ id: 'a', title: 'A', filePath: null, content: 'x', language: 'plaintext', eol: 'LF' as const, encoding: 'utf8' as const, dirty: true }], activeId: 'a' }
    await s.save(data)
    expect(await new SessionStore(dir).load()).toEqual(data)
  })

  it('returns empty session on corrupt file', async () => {
    const s = new SessionStore(dir)
    mkdirSync(join(dir, 'session'), { recursive: true })
    writeFileSync(join(dir, 'session', 'session.json'), '{ not json')
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })

  it('drops malformed buffer entries and keeps the valid ones', async () => {
    // null / non-object / missing-required-field entries must not survive — otherwise
    // bufferManager.restore() dereferences them and throws inside boot() (blank window).
    const valid = { id: 'v1', title: 'Note', filePath: null, content: 'hello', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false }
    seed({ buffers: [null, 42, { id: 'x' }, { id: 5, title: 't', content: 'c' }, valid], activeId: 'v1' })
    const data = await new SessionStore(dir).load()
    expect(data.buffers).toEqual([valid])
    expect(data.activeId).toBe('v1')
  })

  it('nulls a non-string activeId', async () => {
    const valid = { id: 'v1', title: 'Note', filePath: null, content: 'hello', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false }
    seed({ buffers: [valid], activeId: 42 })
    expect((await new SessionStore(dir).load()).activeId).toBeNull()
  })

  it('nulls an activeId that points to a dropped (malformed) buffer', async () => {
    // The active buffer was the malformed one we filter out; a dangling activeId would
    // make boot() skip its fallback and crash on manager.get(activeId).
    const valid = { id: 'v1', title: 'Note', filePath: null, content: 'hello', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false }
    seed({ buffers: [{ id: 'gone' }, valid], activeId: 'gone' })
    const data = await new SessionStore(dir).load()
    expect(data.buffers).toEqual([valid])
    expect(data.activeId).toBeNull()
  })
})
