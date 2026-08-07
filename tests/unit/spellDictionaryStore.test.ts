import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWrite } from '../../src/main/atomicWrite'
import { SpellDictionaryStore } from '../../src/main/spellDictionaryStore'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'nc-spell-dictionary-'))
  file = join(dir, 'spell-dictionary.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SpellDictionaryStore', () => {
  it('returns an empty list when the dictionary is missing or corrupt', async () => {
    const store = new SpellDictionaryStore(dir)
    expect(await store.load()).toEqual([])

    await writeFile(file, '{not json')
    expect(await store.load()).toEqual([])

    await writeFile(file, JSON.stringify({ version: 2, words: ['ignored'] }))
    expect(await store.load()).toEqual([])
  })

  it('keeps only trimmed strings of at most 80 Unicode characters', async () => {
    const eightyEmoji = '😀'.repeat(80)
    const eightyOneEmoji = '😀'.repeat(81)
    await writeFile(file, JSON.stringify({
      version: 1,
      words: [
        '  Café  ',
        eightyEmoji,
        eightyOneEmoji,
        '',
        '   ',
        42,
        null,
        'control\u0000word',
        'folder/word',
        'folder\\word',
      ],
    }))

    const words = await new SpellDictionaryStore(dir).load()
    expect(words).toHaveLength(2)
    expect(words).toEqual(expect.arrayContaining(['Café', eightyEmoji]))
  })

  it('deduplicates case-insensitively, preserves the first display form, and sorts', async () => {
    await writeFile(file, JSON.stringify({
      version: 1,
      words: ['Zulu', 'alpha', 'ALPHA', 'Bravo', 'zulu'],
    }))

    expect(await new SpellDictionaryStore(dir).load()).toEqual(['alpha', 'Bravo', 'Zulu'])
  })

  it.each([
    ['', 'add'],
    ['bad/word', 'add'],
    ['bad\\word', 'remove'],
    ['bad\u0000word', 'remove'],
    ['x'.repeat(81), 'add'],
  ] as const)('rejects invalid input %j passed to %s', async (value, operation) => {
    const store = new SpellDictionaryStore(dir)
    await expect(store[operation](value)).rejects.toThrow('Invalid personal dictionary word')
  })

  it('serializes concurrent add and remove mutations without losing either change', async () => {
    await writeFile(file, JSON.stringify({ version: 1, words: ['Keep', 'RemoveMe'] }, null, 2))
    let writes = 0
    const delayedFirstWrite = async (target: string, content: string): Promise<void> => {
      writes += 1
      if (writes === 1) await new Promise(resolve => setTimeout(resolve, 30))
      await atomicWrite(target, content)
    }
    const store = new SpellDictionaryStore(dir, delayedFirstWrite)

    await Promise.all([store.add('Added'), store.remove('RemoveMe')])

    expect(await store.load()).toEqual(['Added', 'Keep'])
  })

  it('rejects a failed write and preserves the previous on-disk dictionary', async () => {
    const original = JSON.stringify({ version: 1, words: ['OldWord'] }, null, 2)
    await writeFile(file, original)
    const store = new SpellDictionaryStore(dir, async () => {
      throw new Error('simulated disk failure')
    })

    await expect(store.add('NewWord')).rejects.toThrow('simulated disk failure')
    expect(await readFile(file, 'utf8')).toBe(original)
    expect(await store.load()).toEqual(['OldWord'])
  })
})
