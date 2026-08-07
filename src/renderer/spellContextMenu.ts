import type { SpellIssue } from '../shared/spell'
import type { ContextMenuEntry } from './contextMenu'
import type { EditorContextMenuTarget } from './editorContextMenu'
import type { SpellActionArgs, SpellIssueLookup } from './spellCheckCore'

export interface SpellContextMenuTarget extends EditorContextMenuTarget {
  editorEntries: () => ContextMenuEntry[]
}

export interface SpellContextMenuDeps {
  currentIssue: (target: SpellIssueLookup) => SpellIssue | null
  suggestions: (target: SpellActionArgs) => Promise<string[]>
  replace: (target: SpellActionArgs) => boolean
  ignore: (target: SpellActionArgs) => Promise<void>
  add: (target: SpellActionArgs) => Promise<void>
  show: (x: number, y: number, entries: ContextMenuEntry[]) => void
}

const sameIssue = (issue: SpellIssue | null, action: SpellActionArgs): boolean =>
  issue?.start === action.start && issue.end === action.end && issue.text === action.word

export class SpellContextMenuCoordinator {
  private epoch = 0
  private disposed = false

  constructor(private readonly deps: SpellContextMenuDeps) {}

  tryOpen(target: SpellContextMenuTarget | null): boolean {
    const epoch = ++this.epoch
    if (this.disposed || !target) return false
    const current = this.deps.currentIssue(target)
    if (!current) return false
    const action: SpellActionArgs = {
      modelUri: target.modelUri,
      modelVersion: target.modelVersion,
      start: current.start,
      end: current.end,
      word: current.text,
    }
    void this.open(epoch, target, action)
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.epoch++
  }

  private async open(epoch: number, target: SpellContextMenuTarget, action: SpellActionArgs): Promise<void> {
    const requested = await this.deps.suggestions(action)
    if (this.disposed || epoch !== this.epoch) return
    if (!sameIssue(this.deps.currentIssue(target), action)) return
    const suggestions = [...new Set(requested)].slice(0, 5)
    const entries: ContextMenuEntry[] = suggestions.map(replacement => ({
      label: replacement,
      run: () => { this.deps.replace({ ...action, replacement }) },
    }))
    if (entries.length) entries.push({ separator: true })
    entries.push(
      { label: 'Ignore for this session', run: () => { void this.deps.ignore(action) } },
      { label: 'Add to personal dictionary', run: () => { void this.deps.add(action) } },
    )
    const editorEntries = target.editorEntries()
    if (editorEntries.length) entries.push({ separator: true }, ...editorEntries)
    this.deps.show(target.clientX, target.clientY, entries)
  }
}
