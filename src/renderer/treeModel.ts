import type { DirEntry } from '../shared/types'

// Pure tree state: per-directory children cache + expanded set. No DOM.
export class TreeModel {
  root: string | null = null
  private childrenByPath = new Map<string, DirEntry[]>()
  private expanded = new Set<string>()

  setRoot(root: string): void {
    this.root = root
    this.childrenByPath.clear()
    this.expanded.clear()
  }
  setChildren(path: string, entries: DirEntry[]): void { this.childrenByPath.set(path, entries) }
  getChildren(path: string): DirEntry[] | undefined { return this.childrenByPath.get(path) }
  hasChildren(path: string): boolean { return this.childrenByPath.has(path) }
  isExpanded(path: string): boolean { return this.expanded.has(path) }
  setExpanded(path: string, on: boolean): void { on ? this.expanded.add(path) : this.expanded.delete(path) }
  expandedPaths(): string[] { return [...this.expanded] }
  invalidate(path: string): void { this.childrenByPath.delete(path) }
}
