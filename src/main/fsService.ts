import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { DirEntry } from '../shared/types'

const IGNORE = new Set(['.git', 'node_modules'])
const MAX_INDEX_FILES = 20000

export function shouldIgnore(name: string, showAll: boolean): boolean {
  return !showAll && IGNORE.has(name)
}

export async function readDir(path: string, showAll: boolean): Promise<DirEntry[]> {
  try {
    const ents = await fs.readdir(path, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const e of ents) {
      if (shouldIgnore(e.name, showAll)) continue
      out.push({ name: e.name, path: join(path, e.name), isDir: e.isDirectory() })
    }
    out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    return out
  } catch {
    return []
  }
}

export async function walkFiles(root: string, showAll: boolean): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    if (out.length >= MAX_INDEX_FILES) return
    let ents
    try { ents = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (out.length >= MAX_INDEX_FILES) return
      if (shouldIgnore(e.name, showAll)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else out.push(p)
    }
  }
  await walk(root)
  return out
}

export async function createFile(path: string): Promise<boolean> {
  try { await fs.writeFile(path, '', { flag: 'wx' }); return true } catch { return false }
}

export async function createFolder(path: string): Promise<boolean> {
  try { await fs.mkdir(path); return true } catch { return false }
}

export async function renamePath(from: string, to: string): Promise<boolean> {
  try { await fs.rename(from, to); return true } catch { return false }
}

export async function dirExists(path: string): Promise<boolean> {
  try { return (await fs.stat(path)).isDirectory() } catch { return false }
}

/** True only when nothing exists at `path` (ENOENT). Any other access error — a locked
 *  file, a permission denial, a temporarily-offline drive — returns false, so a GC sweep
 *  never deletes data for a file that might still be there. */
export async function isMissing(path: string): Promise<boolean> {
  try { await fs.access(path); return false }
  catch (e) { return (e as NodeJS.ErrnoException)?.code === 'ENOENT' }
}
