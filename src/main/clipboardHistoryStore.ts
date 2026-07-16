import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './atomicWrite'

// Defence-in-depth ceilings, mirroring the renderer's PasteHistoryList caps
// (50 entries × 1 000 000 chars). The renderer already clamps, but main must not
// trust the payload — a buggy/compromised sender could otherwise bloat the store
// on disk without bound. Kept slightly above the renderer's per-entry cap so a
// normally-truncated entry (which carries a " …[truncated]" suffix) passes untouched.
const MAX_ENTRIES = 50
const MAX_ENTRY_LEN = 1_000_100

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
    const clamped = (Array.isArray(entries) ? entries : [])
      .filter((x): x is string => typeof x === 'string')
      .slice(0, MAX_ENTRIES)
      .map(e => e.length > MAX_ENTRY_LEN ? e.slice(0, MAX_ENTRY_LEN) : e)
    await atomicWrite(this.file, JSON.stringify(clamped))
  }
}
