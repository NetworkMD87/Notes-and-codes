import type { BufferState, OpenedFile } from '../shared/types'

/** A watcher completion is current only while it still describes the same live buffer path. */
export function isCurrentBufferPath(
  current: BufferState | undefined,
  captured: BufferState,
  path: string,
): boolean {
  return current === captured && captured.filePath === path
}

export function isCurrentFileChange(
  current: BufferState | undefined,
  captured: BufferState,
  path: string,
  generation: number,
  generations: ReadonlyMap<string, number>,
): boolean {
  return isCurrentBufferPath(current, captured, path) && generations.get(captured.id) === generation
}

/** Apply a completed disk reload only if it still belongs to the captured buffer path. */
export function applyReloadIfCurrent(
  current: BufferState | undefined,
  captured: BufferState,
  path: string,
  file: OpenedFile,
): boolean {
  if (!isCurrentBufferPath(current, captured, path)) return false
  captured.content = file.content
  captured.eol = file.eol
  captured.encoding = file.encoding
  captured.dirty = false
  captured.diskMtime = file.mtimeMs
  return true
}
