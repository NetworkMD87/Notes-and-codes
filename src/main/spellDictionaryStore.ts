import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { atomicWrite } from './atomicWrite'

interface SpellDictionaryFile { version: 1; words: string[] }
type SpellWriter = (target: string, content: string) => Promise<void>

const MAX_WORD_LENGTH = 80

function validWord(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const word = value.trim()
  if (!word || [...word].length > MAX_WORD_LENGTH) return null
  if (/\p{C}|[\\/]/u.test(word)) return null
  return word
}

function sanitize(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  const unique = new Map<string, string>()
  for (const value of values) {
    const word = validWord(value)
    if (word && !unique.has(word.toLocaleLowerCase('en'))) {
      unique.set(word.toLocaleLowerCase('en'), word)
    }
  }
  return [...unique.values()].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

export class SpellDictionaryStore {
  private readonly path: string
  private chain = Promise.resolve()

  constructor(baseDir: string, private write: SpellWriter = atomicWrite) {
    this.path = join(baseDir, 'spell-dictionary.json')
  }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<SpellDictionaryFile>
      return parsed.version === 1 ? sanitize(parsed.words) : []
    } catch {
      return []
    }
  }

  add(value: unknown): Promise<string[]> {
    const word = validWord(value)
    if (!word) return Promise.reject(new Error('Invalid personal dictionary word'))
    return this.mutate(words => sanitize([...words, word]))
  }

  remove(value: unknown): Promise<string[]> {
    const word = validWord(value)
    if (!word) return Promise.reject(new Error('Invalid personal dictionary word'))
    const removeKey = word.toLocaleLowerCase('en')
    return this.mutate(words =>
      words.filter(saved => saved.toLocaleLowerCase('en') !== removeKey))
  }

  private mutate(change: (words: string[]) => string[]): Promise<string[]> {
    const operation = this.chain.then(async () => {
      const words = change(await this.load())
      await mkdir(dirname(this.path), { recursive: true })
      await this.write(this.path, JSON.stringify({ version: 1, words }, null, 2))
      return words
    })
    this.chain = operation.then(() => undefined, () => undefined)
    return operation
  }
}
