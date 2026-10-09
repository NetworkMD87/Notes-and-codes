import type { BufferState } from '../shared/types'

/** Common leading text may truncate first, preserving the part that distinguishes a folder. */
export function tabFolderPrefix(label: string, labels: Iterable<string>): string {
  let shared = 0
  const characters = [...label]
  for (const other of labels) {
    if (other.toLowerCase() === label.toLowerCase()) continue
    const otherCharacters = [...other]
    let length = 0
    while (length < characters.length && length < otherCharacters.length &&
      characters[length].toLowerCase() === otherCharacters[length].toLowerCase()) length++
    shared = Math.max(shared, length)
  }
  // Keep at least one original character visible, even if one label is another's prefix.
  return characters.slice(0, Math.min(shared, Math.max(0, characters.length - 1))).join('')
}

/** Saved-file duplicates get the shortest distinguishing trailing directory path. */
export function tabFolderLabels(buffers: readonly BufferState[]): Map<string, string> {
  const groups = new Map<string, BufferState[]>()
  for (const buffer of buffers) {
    if (typeof buffer.filePath !== 'string' || !buffer.filePath) continue
    const key = buffer.title.toLowerCase()
    const group = groups.get(key) ?? []
    group.push(buffer)
    groups.set(key, group)
  }
  const labels = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const parents = group.map(buffer => {
      const path = buffer.filePath!.replaceAll('/', '\\')
      const parent = path.slice(0, Math.max(0, path.lastIndexOf('\\')))
      return { parts: parent.split('\\').filter(Boolean), unc: parent.startsWith('\\\\') }
    })
    const suffix = (index: number, depth: number): string => {
      const { parts, unc } = parents[index]
      const label = parts.slice(-depth).join('\\') || '.'
      if (unc && depth >= parts.length) return '\\\\' + label
      return /^[a-z]:$/i.test(label) ? label + '\\' : label
    }
    group.forEach((buffer, index) => {
      for (let depth = 1; depth <= Math.max(1, parents[index].parts.length); depth++) {
        const label = suffix(index, depth)
        labels.set(buffer.id, label)
        if (group.every((_, other) => other === index || suffix(other, depth).toLowerCase() !== label.toLowerCase())) break
      }
    })
  }
  return labels
}
