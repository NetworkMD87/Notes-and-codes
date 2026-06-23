import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export class RecentFilesStore {
  private file: string
  constructor(baseDir: string, private cap = 10) { this.file = join(baseDir, 'recent-files.json') }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, this.cap) : []
    } catch { return [] }
  }

  async add(path: string): Promise<string[]> {
    const list = [path, ...(await this.load()).filter(p => p !== path)].slice(0, this.cap)
    await fs.writeFile(this.file, JSON.stringify(list), 'utf8')
    return list
  }

  async clear(): Promise<void> { await fs.writeFile(this.file, '[]', 'utf8') }
}
