import { describe, expect, it } from 'vitest'
import { SearchGeneration } from '../../src/main/searchGeneration'

describe('SearchGeneration', () => {
  it('supersedes an older request when a newer request begins', () => {
    const generation = new SearchGeneration()
    const first = generation.begin(1)
    const second = generation.begin(2)

    expect(first.shouldCancel()).toBe(true)
    expect(second.shouldCancel()).toBe(false)
  })

  it('cleans up a normally completed active generation', () => {
    const generation = new SearchGeneration()
    const lease = generation.begin(7)

    lease.complete()
    generation.cancel(7)

    expect(lease.shouldCancel()).toBe(false)
  })

  it('an older completion cannot clear a newer active generation', () => {
    const generation = new SearchGeneration()
    const older = generation.begin(1)
    const newer = generation.begin(2)

    older.complete()
    generation.cancel(2)

    expect(newer.shouldCancel()).toBe(true)
  })

  it('ignores a mismatched cancellation id', () => {
    const generation = new SearchGeneration()
    const active = generation.begin(7)

    generation.cancel(6)

    expect(active.shouldCancel()).toBe(false)
  })

  it('cancels the active generation with the matching renderer id', () => {
    const generation = new SearchGeneration()
    const active = generation.begin(7)

    generation.cancel(7)

    expect(active.shouldCancel()).toBe(true)
  })

  it('allows renderer ids to restart after a reload', () => {
    const generation = new SearchGeneration()
    const beforeReload = generation.begin(40)
    const afterReload = generation.begin(1)

    expect(beforeReload.shouldCancel()).toBe(true)
    expect(afterReload.shouldCancel()).toBe(false)

    generation.cancel(1)
    expect(afterReload.shouldCancel()).toBe(true)
  })
})
