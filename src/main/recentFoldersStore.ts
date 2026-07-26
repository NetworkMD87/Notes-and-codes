import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite } from './atomicWrite'

/** Windows path comparison: the same folder can be written with different casing (`C:\Foo` vs
 *  `c:\foo`), so dedupe and removal both fold case — the same rule Find in Files applies to its
 *  skip paths. Still an exact-string match otherwise; no normalisation of separators. */
const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Recently opened folder roots, most-recent-first. Mirrors RecentFilesStore, plus remove() —
 *  the folder panel prunes an entry the moment a click proves the folder is gone. */
export class RecentFoldersStore {
  private file: string
  // Serialize writes so two near-simultaneous add()/remove()s can't read-modify-write over each other.
  private chain: Promise<unknown> = Promise.resolve()
  constructor(baseDir: string, private cap = 10) { this.file = join(baseDir, 'recent-folders.json') }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, this.cap) : []
    } catch { return [] }
  }

  async add(path: string): Promise<string[]> {
    const next = this.chain.then(async () => {
      const list = [path, ...(await this.load()).filter(p => !samePath(p, path))].slice(0, this.cap)
      await atomicWrite(this.file, JSON.stringify(list))
      return list
    })
    this.chain = next.catch(() => {})
    return next
  }

  async remove(path: string): Promise<string[]> {
    const next = this.chain.then(async () => {
      const list = (await this.load()).filter(p => !samePath(p, path))
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
