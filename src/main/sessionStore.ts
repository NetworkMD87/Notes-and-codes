import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { SessionData } from '../shared/types'
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
      return parsed as SessionData
    } catch {
      return { ...EMPTY }
    }
  }
}
