import type { SessionData } from '../shared/types'

export function snapshotSession(session: SessionData): SessionData {
  return {
    activeId: session.activeId,
    buffers: session.buffers.map(buffer => ({
      ...buffer,
      highlights: buffer.highlights?.map(highlight => ({ ...highlight })),
    })),
  }
}
