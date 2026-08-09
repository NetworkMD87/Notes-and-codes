import { describe, expect, it } from 'vitest'
import { SearchGeneration } from '../../src/main/searchGeneration'

describe('SearchGeneration', () => {
  it('supersedes an older request when a newer request begins', () => {
    const generation = new SearchGeneration()
    const first = generation.begin(1)
    const second = generation.begin(2)

    expect(first()).toBe(true)
    expect(second()).toBe(false)
  })

  it('cancels only the active request with the matching renderer id', () => {
    const generation = new SearchGeneration()
    const active = generation.begin(7)

    generation.cancel(6)
    expect(active()).toBe(false)

    generation.cancel(7)
    expect(active()).toBe(true)
  })

  it('allows renderer ids to restart after a reload', () => {
    const generation = new SearchGeneration()
    const beforeReload = generation.begin(40)
    const afterReload = generation.begin(1)

    expect(beforeReload()).toBe(true)
    expect(afterReload()).toBe(false)

    generation.cancel(1)
    expect(afterReload()).toBe(true)
  })
})
