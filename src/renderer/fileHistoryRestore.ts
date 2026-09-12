import type { BufferState, FileVersion } from '../shared/types'
import type { BufferManager } from './bufferManager'
import type { FileHistoryContext } from './fileHistoryPanel'

interface DisplayedPane {
  getContent: () => string
  refreshBuffer: (buffer: BufferState) => void
}

export interface FileHistoryRestoreDeps {
  manager: Pick<BufferManager, 'get' | 'update'>
  paneDisplaying: (id: string) => DisplayedPane | null
  focusedBufferId: () => string | null
  snapshotHistory: (path: string, content: string, eol: BufferState['eol'], encoding: BufferState['encoding']) => void
  syncPreview: () => void
  refreshSpell: () => void
  renderTabs: () => void
  refreshStatus: () => void
  scheduleSessionSave: () => void
  notifyRestored: () => void
}

export function restoreFileHistoryVersion(deps: FileHistoryRestoreDeps, version: FileVersion, origin: FileHistoryContext): void {
  const buffer = deps.manager.get(origin.id)
  if (!buffer || buffer.filePath !== origin.path) return

  const displayed = deps.paneDisplaying(origin.id)
  deps.snapshotHistory(origin.path, displayed?.getContent() ?? buffer.content, buffer.eol, buffer.encoding)
  deps.manager.update(origin.id, version.content)
  displayed?.refreshBuffer(buffer)
  if (deps.focusedBufferId() === origin.id) {
    deps.syncPreview()
    deps.refreshSpell()
  }
  deps.renderTabs()
  deps.refreshStatus()
  deps.scheduleSessionSave()
  deps.notifyRestored()
}
