import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Snippet } from '../shared/types'
import { atomicWrite } from './atomicWrite'

function valid(x: unknown): x is Snippet {
  return !!x && typeof x === 'object'
    && typeof (x as Snippet).id === 'string'
    && typeof (x as Snippet).name === 'string'
    && typeof (x as Snippet).body === 'string'
}

export class SnippetStore {
  private file: string
  constructor(baseDir: string) { this.file = join(baseDir, 'snippets.json') }

  async load(): Promise<Snippet[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter(valid) : []
    } catch { return [] }
  }

  async save(list: Snippet[]): Promise<void> {
    await atomicWrite(this.file, JSON.stringify(list))
  }
}
