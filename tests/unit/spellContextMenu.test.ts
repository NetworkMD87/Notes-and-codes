import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuEntry } from '../../src/renderer/contextMenu'
import type { SpellIssue } from '../../src/shared/spell'
import type { SpellIssueLookup } from '../../src/renderer/spellCheckCore'
import {
  SpellContextMenuCoordinator,
  type SpellContextMenuDeps,
  type SpellContextMenuTarget,
} from '../../src/renderer/spellContextMenu'

const issue: SpellIssue = { text: 'speling', start: 0, end: 7 }
const target = (overrides: Partial<SpellContextMenuTarget> = {}): SpellContextMenuTarget => ({
  clientX: 40,
  clientY: 60,
  modelUri: 'file:///note.txt',
  modelVersion: 3,
  startOffset: 2,
  endOffset: 2,
  editorEntries: () => [{ label: 'Copy', run: vi.fn() }],
  ...overrides,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(pass => { resolve = pass })
  return { promise, resolve }
}

function harness(current: (lookup: SpellIssueLookup) => SpellIssue | null = () => issue) {
  const pending = deferred<string[]>()
  const shown: Array<{ x: number; y: number; entries: ContextMenuEntry[] }> = []
  const deps: SpellContextMenuDeps = {
    currentIssue: current,
    suggestions: vi.fn(() => pending.promise),
    replace: vi.fn(() => true),
    ignore: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    show: (x, y, entries) => { shown.push({ x, y, entries }) },
  }
  return { coordinator: new SpellContextMenuCoordinator(deps), deps, pending, shown }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('SpellContextMenuCoordinator', () => {
  it('does not own a click with no current issue', () => {
    const h = harness(() => null)
    expect(h.coordinator.tryOpen(target())).toBe(false)
    expect(h.deps.suggestions).not.toHaveBeenCalled()
  })

  it('owns a current issue and orders all groups', async () => {
    const h = harness()
    expect(h.coordinator.tryOpen(target())).toBe(true)
    h.pending.resolve(['spelling', 'spieling'])
    await flush()
    expect(h.shown).toHaveLength(1)
    expect(h.shown[0].entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'spelling', 'spieling', '---',
      'Ignore for this session', 'Add to personal dictionary', '---', 'Copy',
    ])
  })

  it('omits an empty suggestion group', async () => {
    const h = harness()
    h.coordinator.tryOpen(target())
    h.pending.resolve([])
    await flush()
    expect(h.shown[0].entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'Ignore for this session', 'Add to personal dictionary', '---', 'Copy',
    ])
  })

  it('drops suggestions when the issue becomes stale', async () => {
    let current: SpellIssue | null = issue
    const h = harness(() => current)
    h.coordinator.tryOpen(target())
    current = null
    h.pending.resolve(['spelling'])
    await flush()
    expect(h.shown).toEqual([])
  })

  it('a newer non-issue click invalidates an older request', async () => {
    let current: SpellIssue | null = issue
    const h = harness(() => current)
    h.coordinator.tryOpen(target())
    current = null
    expect(h.coordinator.tryOpen(null)).toBe(false)
    h.pending.resolve(['spelling'])
    await flush()
    expect(h.shown).toEqual([])
  })

  it('deduplicates and caps suggestions at five', async () => {
    const h = harness()
    h.coordinator.tryOpen(target())
    h.pending.resolve(['one', 'two', 'one', 'three', 'four', 'five', 'six'])
    await flush()
    const labels = h.shown[0].entries.flatMap(entry => 'separator' in entry ? [] : [entry.label])
    expect(labels.slice(0, 5)).toEqual(['one', 'two', 'three', 'four', 'five'])
    expect(labels).not.toContain('six')
  })

  it('drops unresolved work after dispose', async () => {
    const h = harness()
    h.coordinator.tryOpen(target())
    h.coordinator.dispose()
    h.pending.resolve(['spelling'])
    await flush()
    expect(h.shown).toEqual([])
  })

  it('routes Replace, Ignore, and Add through supplied core callbacks', async () => {
    const h = harness()
    h.coordinator.tryOpen(target())
    h.pending.resolve(['spelling'])
    await flush()
    const rows = h.shown[0].entries.filter(entry => !('separator' in entry))
    rows.find(row => row.label === 'spelling')!.run()
    rows.find(row => row.label === 'Ignore for this session')!.run()
    rows.find(row => row.label === 'Add to personal dictionary')!.run()
    expect(h.deps.replace).toHaveBeenCalledWith(expect.objectContaining({
      modelUri: 'file:///note.txt', modelVersion: 3, start: 0, end: 7,
      word: 'speling', replacement: 'spelling',
    }))
    expect(h.deps.ignore).toHaveBeenCalledWith(expect.objectContaining({ word: 'speling' }))
    expect(h.deps.add).toHaveBeenCalledWith(expect.objectContaining({ word: 'speling' }))
  })
})
