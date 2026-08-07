import { describe, expect, it } from 'vitest'
import { NspellEngine } from '../../src/renderer/spellEngine'

const word = (text: string, start = 0) => ({ text, start, end: start + text.length })

describe('NspellEngine', () => {
  it('uses the real US and UK dictionaries for their distinct spellings', async () => {
    const us = new NspellEngine()
    const gb = new NspellEngine()
    await us.load('en-US', [])
    await gb.load('en-GB', [])

    expect(us.check([word('color')])).toEqual([])
    expect(us.check([word('colour')])).toHaveLength(1)
    expect(gb.check([word('colour')])).toEqual([])
    expect(gb.check([word('color')])).toHaveLength(1)
  })

  it('limits stable real-dictionary suggestions', async () => {
    const us = new NspellEngine()
    await us.load('en-US', [])

    const suggestions = us.suggest('speling', 5)
    expect(suggestions[0]).toBe('spelling')
    expect(us.suggest('speling', 5)).toEqual(suggestions)
    expect(us.suggest('speling', 2)).toEqual(suggestions.slice(0, 2))
  })

  it('treats session ignores as case-insensitive', async () => {
    const engine = new NspellEngine()
    await engine.load('en-US', [])

    engine.ignoreForSession('Typoo')
    expect(engine.check([word('typoo')])).toEqual([])
  })

  it('adds and removes personal words from correctness', async () => {
    const engine = new NspellEngine()
    await engine.load('en-US', [])
    const personal = word('Codexium')

    expect(engine.check([personal])).toEqual([personal])
    engine.addPersonalWord('codexium')
    expect(engine.check([personal])).toEqual([])
    expect(engine.check([word('CODEXIUM')])).toEqual([])
    engine.removePersonalWord('CODEXIUM')
    expect(engine.check([personal])).toEqual([personal])
  })

  it('checks hyphenated compounds whole before reporting misspelled components', async () => {
    const correctCalls: string[] = []
    const fake = {
      correct(value: string) { correctCalls.push(value); return value === 'well' },
      suggest: () => [], add: () => undefined, remove: () => undefined
    }
    const engine = new NspellEngine(() => fake as any)
    await engine.load('en-US', [])

    expect(engine.check([word('well-known', 10)])).toEqual([word('known', 15)])
    expect(correctCalls).toEqual(['well-known', 'well', 'known'])
  })

  it('caches normalized correctness while retaining every issue range', async () => {
    let calls = 0
    const fake = {
      correct: () => { calls++; return false },
      suggest: () => [], add: () => undefined, remove: () => undefined
    }
    const engine = new NspellEngine(() => fake as any)
    await engine.load('en-US', [])

    expect(engine.check([word('Typoo', 0), word('typoo', 10)])).toEqual([word('Typoo', 0), word('typoo', 10)])
    expect(calls).toBe(1)
  })

  it('does not request suggestions while checking', async () => {
    let suggestions = 0
    const fake = {
      correct: () => false,
      suggest: () => { suggestions++; return [] },
      add: () => undefined, remove: () => undefined
    }
    const engine = new NspellEngine(() => fake as any)
    await engine.load('en-US', [])

    expect(engine.check([word('misspelled')])).toEqual([word('misspelled')])
    expect(suggestions).toBe(0)
  })
})
