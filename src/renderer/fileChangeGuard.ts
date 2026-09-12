import type { BufferState } from '../shared/types'

/** A watcher completion is current only while it still describes the same live buffer path. */
export function isCurrentFileChange(
  current: BufferState | undefined,
  captured: BufferState,
  path: string,
  generation: number,
  generations: ReadonlyMap<string, number>,
): boolean {
  return current === captured && captured.filePath === path && generations.get(captured.id) === generation
}
