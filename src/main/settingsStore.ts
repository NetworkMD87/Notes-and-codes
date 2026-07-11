import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { atomicWrite } from './atomicWrite'

export class SettingsStore {
  private file: string
  // Serialize writes so overlapping save()/update()s can't read-modify-write over each other.
  private chain: Promise<unknown> = Promise.resolve()
  constructor(baseDir: string) { this.file = join(baseDir, 'settings.json') }

  async load(): Promise<Settings> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  save(s: Settings): Promise<void> {
    const next = this.chain.then(() => atomicWrite(this.file, JSON.stringify(s, null, 2)))
    this.chain = next.catch(() => {})
    return next
  }

  /** Merge a partial into the persisted settings and write it back, serialized against
   *  every other write so two concurrent field updates can't clobber each other. */
  update(partial: Partial<Settings>): Promise<Settings> {
    const next = this.chain.then(async () => {
      const merged = { ...(await this.load()), ...partial }
      await atomicWrite(this.file, JSON.stringify(merged, null, 2))
      return merged
    })
    this.chain = next.catch(() => {})
    return next
  }
}
