import { promises as fs } from 'node:fs'
import { join, relative } from 'node:path'
import { compilePathGlobs } from '../shared/pathGlob'
import type { DirEntry, WalkResult, WorkspaceFilter } from '../shared/types'

const MAX_INDEX_FILES = 20000
export interface WalkFilesOptions {
  maxFiles?: number
  shouldCancel?: () => boolean
  afterDirectoryRead?: () => Promise<void>
}

function matcherFor(filter: WorkspaceFilter): ReturnType<typeof compilePathGlobs> {
  return compilePathGlobs(filter.showAll ? [] : filter.excludePatterns)
}

function workspacePath(root: string, path: string): string {
  return relative(root, path).replace(/\\/g, '/')
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b) || (a < b ? -1 : a > b ? 1 : 0)
}

export async function readDir(
  root: string,
  path: string,
  filter: WorkspaceFilter,
): Promise<DirEntry[]> {
  try {
    const matcher = matcherFor(filter)
    const entries = await fs.readdir(path, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const entry of entries) {
      const absolutePath = join(path, entry.name)
      const relativePath = workspacePath(root, absolutePath)
      if (matcher.matches(relativePath) || (entry.isDirectory() && matcher.prunes(relativePath))) continue
      out.push({ name: entry.name, path: absolutePath, isDir: entry.isDirectory() })
    }
    out.sort((a, b) => a.isDir === b.isDir
      ? compareNames(a.name, b.name)
      : a.isDir ? -1 : 1)
    return out
  } catch {
    return []
  }
}

export async function walkFiles(
  root: string,
  filter: WorkspaceFilter,
  options: WalkFilesOptions = {},
): Promise<WalkResult> {
  const matcher = matcherFor(filter)
  const maxFiles = options.maxFiles ?? MAX_INDEX_FILES
  const shouldCancel = options.shouldCancel ?? (() => false)
  const files: string[] = []
  let truncated = false
  async function walk(path: string): Promise<void> {
    if (shouldCancel()) return
    let entries
    try { entries = await fs.readdir(path, { withFileTypes: true }) } catch { return }
    await options.afterDirectoryRead?.()
    if (shouldCancel()) return
    entries.sort((a, b) => compareNames(a.name, b.name))
    for (const entry of entries) {
      if (shouldCancel()) return
      const absolutePath = join(path, entry.name)
      const relativePath = workspacePath(root, absolutePath)
      if (matcher.matches(relativePath) || (entry.isDirectory() && matcher.prunes(relativePath))) continue
      if (entry.isDirectory()) await walk(absolutePath)
      else {
        if (files.length >= maxFiles) { truncated = true; return }
        files.push(absolutePath)
      }
      if (truncated) return
    }
  }
  await walk(root)
  return { files, truncated }
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
