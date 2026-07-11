import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { SessionData, BufferState } from '../shared/types'
import { atomicWrite } from './atomicWrite'

const EMPTY: SessionData = { buffers: [], activeId: null }

export class SessionStore {
  private file: string
  private dir: string
  constructor(baseDir: string) {
    this.dir = join(baseDir, 'session')
    this.file = join(this.dir, 'session.json')
  }

  async save(data: SessionData): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await atomicWrite(this.file, JSON.stringify(data, null, 2))
  }

  async load(): Promise<SessionData> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.buffers)) return { ...EMPTY }
      // Corrupt-safe (store contract): keep only well-formed buffers, so one bad entry
      // (null / non-object / partial write) can't crash bufferManager.restore() at boot.
      const buffers = (parsed.buffers as unknown[]).filter((b): b is BufferState =>
        !!b && typeof b === 'object'
        && typeof (b as BufferState).id === 'string'
        && typeof (b as BufferState).title === 'string'
        && typeof (b as BufferState).content === 'string')
      // activeId must point to a surviving buffer; a dangling one (the active buffer
      // was the malformed entry we just dropped) is nulled so boot picks the first.
      const activeId = buffers.some(b => b.id === parsed.activeId) ? parsed.activeId as string : null
      return { buffers, activeId }
    } catch {
      return { ...EMPTY }
    }
  }
}
