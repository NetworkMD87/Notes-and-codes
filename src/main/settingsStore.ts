import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import { atomicWrite } from './atomicWrite'

export class SettingsStore {
  private file: string
  constructor(baseDir: string) { this.file = join(baseDir, 'settings.json') }

  async load(): Promise<Settings> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(s: Settings): Promise<void> {
    await atomicWrite(this.file, JSON.stringify(s, null, 2))
  }
}
