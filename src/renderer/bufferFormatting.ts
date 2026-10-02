import type { BufferState } from '../shared/types'
import type { BufferManager } from './bufferManager'

/** A background formatter must not publish over edits made while it was awaiting a result. */
export async function formatBufferIfCurrent(
  manager: Pick<BufferManager, 'get' | 'captureRevision' | 'update'>,
  buffer: BufferState,
  format: (content: string, language: string) => Promise<string>,
): Promise<boolean> {
  const { content, language } = buffer
  const revision = manager.captureRevision(buffer.id)
  const formatted = await format(content, language)
  if (manager.get(buffer.id) !== buffer || manager.captureRevision(buffer.id) !== revision
    || buffer.content !== content || buffer.language !== language || formatted === content) return false
  manager.update(buffer.id, formatted)
  return true
}
