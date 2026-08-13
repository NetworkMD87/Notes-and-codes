import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, HIGHLIGHT_COLOURS, type HighlightColour, type Settings } from '../shared/types'
import { normalizePathGlobs } from '../shared/pathGlob'
import { atomicWrite } from './atomicWrite'

function normalizeSettings(value: unknown): Settings {
  const stored = value && typeof value === 'object' ? value as Partial<Settings> : {}
  const rawExcludes = Array.isArray(stored.workspaceExcludes)
    ? stored.workspaceExcludes.filter((item): item is string => typeof item === 'string')
    : DEFAULT_SETTINGS.workspaceExcludes
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    workspaceExcludes: normalizePathGlobs(rawExcludes),
    lastHighlightColour: isHighlightColour(stored.lastHighlightColour)
      ? stored.lastHighlightColour
      : DEFAULT_SETTINGS.lastHighlightColour,
  }
}

function isHighlightColour(value: unknown): value is HighlightColour {
  return (HIGHLIGHT_COLOURS as readonly unknown[]).includes(value)
}

export class SettingsStore {
  private file: string
  // Serialize writes so overlapping save()/update()s can't read-modify-write over each other.
  private chain: Promise<unknown> = Promise.resolve()
  constructor(baseDir: string) { this.file = join(baseDir, 'settings.json') }

  async load(): Promise<Settings> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      return normalizeSettings(JSON.parse(raw))
    } catch {
      return normalizeSettings(undefined)
    }
  }

  save(s: Settings): Promise<void> {
    const next = this.chain.then(() =>
      atomicWrite(this.file, JSON.stringify(normalizeSettings(s), null, 2)))
    this.chain = next.catch(() => {})
    return next
  }

  /** Merge a partial into the persisted settings and write it back, serialized against
   *  every other write so two concurrent field updates can't clobber each other. */
  update(partial: Partial<Settings>): Promise<Settings> {
    const next = this.chain.then(async () => {
      const merged = normalizeSettings({ ...(await this.load()), ...partial })
      await atomicWrite(this.file, JSON.stringify(merged, null, 2))
      return merged
    })
    this.chain = next.catch(() => {})
    return next
  }
}
