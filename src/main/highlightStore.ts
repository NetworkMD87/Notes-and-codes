import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { HIGHLIGHT_COLOURS, type Highlight } from '../shared/types'
import { atomicWrite } from './atomicWrite'

function sanitize(v: unknown): Highlight[] {
  if (!Array.isArray(v)) return []
  return v.filter((h): h is Highlight =>
    !!h && typeof h.start === 'number' && typeof h.end === 'number'
    && h.end > h.start && (HIGHLIGHT_COLOURS as readonly string[]).includes((h as Highlight).colour))
}

export class HighlightStore {
  private file: string
  private dir: string
  private chain: Promise<void> = Promise.resolve()
  constructor(baseDir: string) { this.dir = baseDir; this.file = join(baseDir, 'highlights.json') }

  private async readAll(): Promise<Record<string, Highlight[]>> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      if (!parsed || typeof parsed !== 'object') return {}
      const out: Record<string, Highlight[]> = {}
      for (const [k, v] of Object.entries(parsed)) {
        const clean = sanitize(v)
        if (clean.length) out[k] = clean
      }
      return out
    } catch { return {} }
  }

  async load(path: string): Promise<Highlight[]> {
    // Wait for any in-flight save so a save→load on the same path can't read stale data.
    await this.chain
    return (await this.readAll())[path] ?? []
  }

  async save(path: string, highlights: Highlight[]): Promise<void> {
    const next = this.chain.then(async () => {
      const all = await this.readAll()
      const clean = sanitize(highlights)
      if (clean.length) all[path] = clean
      else delete all[path]
      await fs.mkdir(this.dir, { recursive: true })
      await atomicWrite(this.file, JSON.stringify(all))
    })
    this.chain = next.catch(err => console.error('[highlightStore] save failed for', path, err))
    return next
  }
}
