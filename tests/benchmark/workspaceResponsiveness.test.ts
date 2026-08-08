import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import { walkFiles } from '../../src/main/fsService'
import {
  buildQuickOpenCandidates,
  rankFileCandidates,
  rankFileCandidatesReference,
} from '../../src/renderer/fuzzy'
import { createLargeWorkspace, LARGE_WORKSPACE_FILES } from '../helpers/largeWorkspace'
import type { WorkspaceFilter } from '../../src/shared/types'

const FILTER: WorkspaceFilter = {
  showAll: false,
  excludePatterns: ['**/dist/**'],
}
const QUERIES = ['', 'workspace-target.ts', 'file-000', 'f199']
const EXPECTED_QUERY_CHECKSUMS = {
  '<empty>': 3928438448,
  'workspace-target.ts': 2838739514,
  'file-000': 3928438448,
  f199: 2369245466,
}
let root: string

function checksum(paths: string[]): number {
  let hash = 2166136261
  for (const path of paths) for (const char of path.replace(/\\/g, '/')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const boundedFraction = Math.max(0, Math.min(1, fraction))
  const nearestRankIndex = Math.ceil(boundedFraction * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, nearestRankIndex))]
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'nc-workspace-benchmark-'))
  createLargeWorkspace(root)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('20,000-file workspace benchmark', () => {
  it('uses the conventional nearest-rank percentile', () => {
    expect(percentile([1, 2, 3, 4], 0.75)).toBe(3)
    expect(percentile([4, 3, 2, 1], -1)).toBe(1)
    expect(percentile([4, 3, 2, 1], 2)).toBe(4)
  })

  it('records walk/index, watcher-style refresh, and correct bounded-query p95', async () => {
    expect(
      existsSync(join(root, 'packages', 'pkg-000', 'dist', 'excluded-target.ts')),
      'excluded fixture must exist before traversal',
    ).toBe(true)
    expect(
      existsSync(join(root, 'packages', 'pkg-123', 'src', 'workspace-target.ts')),
      'workspace target fixture must exist before traversal',
    ).toBe(true)

    const coldStart = performance.now()
    const coldWalk = await walkFiles(root, FILTER)
    const candidates = buildQuickOpenCandidates(root, coldWalk.files)
    const coldWalkIndexMs = performance.now() - coldStart
    expect(candidates).toHaveLength(LARGE_WORKSPACE_FILES)
    expect(coldWalk.files.some(path => path.includes('excluded-target.ts'))).toBe(false)

    const refreshStart = performance.now()
    const refreshWalk = await walkFiles(root, FILTER)
    buildQuickOpenCandidates(root, refreshWalk.files)
    const refreshMs = performance.now() - refreshStart

    const queryTimes: number[] = []
    const queryChecksums: Record<string, number> = {}
    const references = new Map(QUERIES.map(query => [
      query,
      rankFileCandidatesReference(query, candidates, 50).map(item => item.path),
    ]))
    for (let repetition = 0; repetition < 50; repetition++) {
      for (const query of QUERIES) {
        const start = performance.now()
        const bounded = rankFileCandidates(query, candidates, 50)
        queryTimes.push(performance.now() - start)
        expect(bounded.map(item => item.path)).toEqual(references.get(query))
        queryChecksums[query || '<empty>'] = checksum(
          bounded.map(item => relative(root, item.path).replace(/\\/g, '/')),
        )
      }
    }
    const p95QueryMs = percentile(queryTimes, 0.95)
    console.info(JSON.stringify({
      files: candidates.length,
      coldWalkIndexMs: Number(coldWalkIndexMs.toFixed(2)),
      refreshMs: Number(refreshMs.toFixed(2)),
      p95QueryMs: Number(p95QueryMs.toFixed(2)),
      queryChecksums,
    }, null, 2))
    expect(queryChecksums).toEqual(EXPECTED_QUERY_CHECKSUMS)
  })
})
