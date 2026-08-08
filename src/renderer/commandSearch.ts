import type { Command } from './commandPalette'

export interface RankedCommand {
  command: Command
  registrationIndex: number
}

type Rank = readonly [kind: number, source: number, gap: number, registrationIndex: number]

const normalize = (value: string): string => value.trim().toLowerCase()

function fieldRank(query: string, value: string, source: number, index: number): Rank | null {
  const text = normalize(value)
  if (text === query) return [0, source, 0, index]
  if (text.startsWith(query)) return [1, source, text.length - query.length, index]
  const contiguous = text.indexOf(query)
  if (contiguous >= 0) return [2, source, contiguous, index]
  let at = -1
  let gap = 0
  for (const char of query) {
    const next = text.indexOf(char, at + 1)
    if (next < 0) return null
    if (at >= 0) gap += next - at - 1
    at = next
  }
  return [3, source, gap, index]
}

export function rankCommands(query: string, commands: readonly Command[]): RankedCommand[] {
  const normalized = normalize(query)
  if (!normalized) return commands.map((command, registrationIndex) => ({ command, registrationIndex }))

  return commands.map((command, registrationIndex) => {
    const fields = [
      fieldRank(normalized, command.label, 0, registrationIndex),
      fieldRank(normalized, command.id, 0, registrationIndex),
      command.hint ? fieldRank(normalized, command.hint, 1, registrationIndex) : null,
    ].filter((rank): rank is Rank => rank !== null)
    fields.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
    return fields[0] ? { command, registrationIndex, rank: fields[0] } : null
  }).filter((entry): entry is RankedCommand & { rank: Rank } => entry !== null)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.registrationIndex - b.registrationIndex)
    .map(({ command, registrationIndex }) => ({ command, registrationIndex }))
}
