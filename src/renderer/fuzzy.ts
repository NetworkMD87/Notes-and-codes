// Pure quick-open matching. No DOM, no node — unit-tested.

export function fuzzyMatch(query: string, text: string): number | null {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  let qi = 0
  let score = 0
  let prev = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === prev + 1 ? 2 : 1 // consecutive-match bonus
      if (ti < 10) score += 1 // early-match bonus
      prev = ti
      qi++
    }
  }
  return qi === q.length ? score : null
}

export interface RankedFile { path: string; name: string; score: number }

export function rankFiles(query: string, files: string[], limit = 50): RankedFile[] {
  const out: RankedFile[] = []
  for (const path of files) {
    const name = path.split(/[\\/]/).pop() ?? path
    const score = fuzzyMatch(query, name)
    if (score !== null) out.push({ path, name, score })
  }
  out.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name))
  return out.slice(0, limit)
}
