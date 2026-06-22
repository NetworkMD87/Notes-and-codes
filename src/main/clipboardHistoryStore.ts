import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export class ClipboardHistoryStore {
  private file: string
  constructor(baseDir: string) { this.file = join(baseDir, 'clipboard-history.json') }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch { return [] }
  }

  async save(entries: string[]): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(entries), 'utf8')
  }
}
