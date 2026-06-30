import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './atomicWrite'

export class RecentFilesStore {
  private file: string
  // Serialize writes so two near-simultaneous add()s can't read-modify-write over each other.
  private chain: Promise<unknown> = Promise.resolve()
  constructor(baseDir: string, private cap = 10) { this.file = join(baseDir, 'recent-files.json') }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, this.cap) : []
    } catch { return [] }
  }

  async add(path: string): Promise<string[]> {
    const next = this.chain.then(async () => {
      const list = [path, ...(await this.load()).filter(p => p !== path)].slice(0, this.cap)
      await atomicWrite(this.file, JSON.stringify(list))
      return list
    })
    this.chain = next.catch(() => {})
    return next
  }

  async clear(): Promise<void> {
    const next = this.chain.then(() => atomicWrite(this.file, '[]'))
    this.chain = next.catch(() => {})
    return next
  }
}
