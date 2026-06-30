import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { FileVersion, EolMode, Encoding } from '../shared/types'
import { atomicWrite } from './atomicWrite'

export class FileHistoryStore {
  private dir: string
  private chains = new Map<string, Promise<void>>()
  constructor(baseDir: string, private cap = 50) { this.dir = join(baseDir, 'file-history') }

  private fileFor(path: string): string {
    return join(this.dir, createHash('sha256').update(path).digest('hex') + '.json')
  }

  private async read(path: string): Promise<FileVersion[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(path), 'utf8'))
      const versions = parsed?.versions
      if (!Array.isArray(versions)) return []
      return versions.filter((v): v is FileVersion =>
        v && typeof v.ts === 'number' && typeof v.content === 'string')
    } catch { return [] }
  }

  private async doSnapshot(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void> {
    const versions = await this.read(path)
    if (versions.length && versions[versions.length - 1].content === content) return
    const last = versions.length ? versions[versions.length - 1].ts : 0
    const ts = Math.max(Date.now(), last + 1)
    versions.push({ ts, content, eol, encoding })
    while (versions.length > this.cap) versions.shift()
    await fs.mkdir(this.dir, { recursive: true })
    await atomicWrite(this.fileFor(path), JSON.stringify({ path, versions }))
  }

  async snapshot(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void> {
    const prev = this.chains.get(path) ?? Promise.resolve()
    const next = prev.then(() => this.doSnapshot(path, content, eol, encoding))
    this.chains.set(path, next.catch(err => console.error('[fileHistoryStore] snapshot failed for', path, err)))
    return next
  }

  async list(path: string): Promise<{ ts: number }[]> {
    return (await this.read(path)).map(v => ({ ts: v.ts })).reverse()
  }

  async get(path: string, ts: number): Promise<FileVersion | null> {
    return (await this.read(path)).find(v => v.ts === ts) ?? null
  }
}
