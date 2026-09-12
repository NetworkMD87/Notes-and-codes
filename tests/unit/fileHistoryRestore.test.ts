import { describe, expect, it, vi } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'
import type { FileHistoryContext } from '../../src/renderer/fileHistoryPanel'
import type { FileVersion } from '../../src/shared/types'

const version: FileVersion = { ts: 1000, content: 'saved A', eol: 'LF', encoding: 'utf8' }

function makeBuffers() {
  const ids = ['buffer-a', 'buffer-b']
  const manager = new BufferManager(() => ids.shift()!)
  const a = manager.create({ title: 'A', filePath: 'C:\\notes\\a.txt', content: 'manager A' })
  const b = manager.create({ title: 'B', filePath: 'C:\\notes\\b.txt', content: 'focused B' })
  const origin: FileHistoryContext = { id: a.id, path: a.filePath!, title: a.title, content: 'opened A', language: a.language }
  return { manager, a, b, origin }
}

describe('restoreFileHistoryVersion', () => {
  it('restores the originating buffer from its non-focused split pane', async () => {
    const { restoreFileHistoryVersion } = await import('../../src/renderer/fileHistoryRestore')
    const { manager, a, b, origin } = makeBuffers()
    const targetPane = { getContent: () => 'live pane A', refreshBuffer: vi.fn() }
    const snapshotHistory = vi.fn()
    const syncPreview = vi.fn()
    const refreshSpell = vi.fn()
    const renderTabs = vi.fn()
    const refreshStatus = vi.fn()
    const scheduleSessionSave = vi.fn()
    const notifyRestored = vi.fn()

    restoreFileHistoryVersion({
      manager,
      paneDisplaying: id => id === a.id ? targetPane : null,
      focusedBufferId: () => b.id,
      snapshotHistory,
      syncPreview,
      refreshSpell,
      renderTabs,
      refreshStatus,
      scheduleSessionSave,
      notifyRestored,
    }, version, origin)

    expect(snapshotHistory).toHaveBeenCalledWith(origin.path, 'live pane A', a.eol, a.encoding)
    expect(manager.get(a.id)).toMatchObject({ content: version.content, dirty: true })
    expect(manager.get(b.id)).toMatchObject({ content: 'focused B', dirty: false })
    expect(targetPane.refreshBuffer).toHaveBeenCalledWith(a)
    expect(syncPreview).not.toHaveBeenCalled()
    expect(refreshSpell).not.toHaveBeenCalled()
    expect(renderTabs).toHaveBeenCalledOnce()
    expect(refreshStatus).toHaveBeenCalledOnce()
    expect(scheduleSessionSave).toHaveBeenCalledOnce()
    expect(notifyRestored).toHaveBeenCalledOnce()
  })

  it('snapshots manager content and refreshes focused UI when the origin is not displayed', async () => {
    const { restoreFileHistoryVersion } = await import('../../src/renderer/fileHistoryRestore')
    const { manager, a, origin } = makeBuffers()
    const snapshotHistory = vi.fn()
    const syncPreview = vi.fn()
    const refreshSpell = vi.fn()

    restoreFileHistoryVersion({
      manager,
      paneDisplaying: () => null,
      focusedBufferId: () => a.id,
      snapshotHistory,
      syncPreview,
      refreshSpell,
      renderTabs: vi.fn(),
      refreshStatus: vi.fn(),
      scheduleSessionSave: vi.fn(),
      notifyRestored: vi.fn(),
    }, version, origin)

    expect(snapshotHistory).toHaveBeenCalledWith(origin.path, 'manager A', a.eol, a.encoding)
    expect(manager.get(a.id)?.content).toBe(version.content)
    expect(syncPreview).toHaveBeenCalledOnce()
    expect(refreshSpell).toHaveBeenCalledOnce()
  })

  it('does nothing when the originating buffer path no longer matches', async () => {
    const { restoreFileHistoryVersion } = await import('../../src/renderer/fileHistoryRestore')
    const { manager, a, origin } = makeBuffers()
    const snapshotHistory = vi.fn()

    restoreFileHistoryVersion({
      manager,
      paneDisplaying: () => null,
      focusedBufferId: () => a.id,
      snapshotHistory,
      syncPreview: vi.fn(),
      refreshSpell: vi.fn(),
      renderTabs: vi.fn(),
      refreshStatus: vi.fn(),
      scheduleSessionSave: vi.fn(),
      notifyRestored: vi.fn(),
    }, version, { ...origin, path: 'C:\\notes\\renamed.txt' })

    expect(snapshotHistory).not.toHaveBeenCalled()
    expect(manager.get(a.id)?.content).toBe('manager A')
  })
})
