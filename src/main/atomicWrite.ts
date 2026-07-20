import { promises as fs } from 'node:fs'

/**
 * Crash-safe write: write to a unique sibling `{file}.<pid>.<rand>.tmp`, then atomically
 * rename it over the target. `fs.rename` is atomic on a single volume (NTFS uses
 * MOVEFILE_REPLACE_EXISTING), so a crash mid-write leaves the original intact instead of
 * truncated. On any failure the temp is removed so an interrupted write can't strand a
 * `.tmp` file. The caller ensures the directory exists (most stores `mkdir` first).
 *
 * We deliberately do NOT `fsync` the temp before the rename. It was tried (audit L3) but
 * Windows `FlushFileBuffers` has highly variable latency and occasionally stalled the write
 * path by seconds (reproducibly flaked the settings-persist smoke test); the durability gain
 * is marginal — the crash-between-write-and-rename window is rare on NTFS — and not worth the
 * user-facing latency regression for a local scratchpad.
 */
export async function atomicWrite(
  file: string,
  data: string | NodeJS.ArrayBufferView,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  // Unique temp name per write so two concurrent writes to the same target can't share
  // one `.tmp` (A writes tmp → B overwrites tmp → A renames B's bytes → B renames ENOENT).
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    // encoding is ignored by Node when `data` is a Buffer/ArrayBufferView.
    await fs.writeFile(tmp, data, encoding)
    await fs.rename(tmp, file)
  } catch (err) {
    // Never leave the temp behind on a failed write/rename.
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
