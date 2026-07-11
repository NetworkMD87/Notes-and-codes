import { promises as fs } from 'node:fs'

/**
 * Crash-safe write: write to a sibling `{file}.tmp`, then atomically rename it over the
 * target. `fs.rename` is atomic on a single volume (NTFS uses MOVEFILE_REPLACE_EXISTING),
 * so a crash mid-write leaves the original intact instead of truncated. The caller is
 * responsible for ensuring the directory exists (most stores `mkdir` first).
 */
export async function atomicWrite(
  file: string,
  data: string | NodeJS.ArrayBufferView,
  encoding: BufferEncoding = 'utf8'
): Promise<void> {
  // Unique temp name per write so two concurrent writes to the same target can't share
  // one `.tmp` (A writes tmp → B overwrites tmp → A renames B's bytes → B renames ENOENT).
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  // encoding is ignored by Node when `data` is a Buffer/ArrayBufferView.
  await fs.writeFile(tmp, data, encoding)
  await fs.rename(tmp, file)
}
