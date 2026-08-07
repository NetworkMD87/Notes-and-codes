import nspell from 'nspell'
import { bundledDictionary } from './spellDictionaries'
import type { ResolvedSpellLocale, SpellIssue, SpellWord } from '../shared/spell'

export interface SpellEngine {
  load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void>
  check(words: SpellWord[]): SpellIssue[]
  suggest(word: string, limit: number): string[]
  ignoreForSession(word: string): void
  addPersonalWord(word: string): void
  removePersonalWord(word: string): void
}

export type NspellLike = ReturnType<typeof nspell>
export type NspellFactory = (dictionary: { aff: string; dic: string }) => NspellLike

const lookup = (word: string): string => word.replaceAll('’', "'")
const key = (word: string): string => lookup(word).toLocaleLowerCase('en')

export class NspellEngine implements SpellEngine {
  private spell: NspellLike | null = null
  private ignored = new Set<string>()
  private personal = new Map<string, string>()

  constructor(private create: NspellFactory = nspell) {}

  async load(locale: ResolvedSpellLocale, personalWords: string[]): Promise<void> {
    const dictionary = bundledDictionary(locale)
    this.spell = this.create({ aff: dictionary.aff, dic: dictionary.dic })
    this.personal.clear()
    for (const word of personalWords) this.addPersonalWord(word)
  }

  check(words: SpellWord[]): SpellIssue[] {
    const spell = this.required()
    const issues: SpellIssue[] = []
    const correctness = new Map<string, boolean>()
    const correct = (value: string): boolean => {
      const normalized = lookup(value)
      const k = key(normalized)
      if (this.ignored.has(k)) return true
      if (this.personal.has(k)) return true
      const cached = correctness.get(k)
      if (cached !== undefined) return cached
      const result = spell.correct(normalized)
      correctness.set(k, result)
      return result
    }
    for (const word of words) {
      const normalized = lookup(word.text)
      if (correct(normalized)) continue
      const components = normalized.includes('-') ? normalized.split('-') : []
      if (!components.length) { issues.push(word); continue }
      let offset = word.start
      for (const component of components) {
        if (!correct(component)) {
          issues.push({ text: word.text.slice(offset - word.start, offset - word.start + component.length), start: offset, end: offset + component.length })
        }
        offset += component.length + 1
      }
    }
    return issues
  }

  suggest(word: string, limit: number): string[] {
    return this.required().suggest(lookup(word)).slice(0, Math.max(0, limit))
  }

  ignoreForSession(word: string): void { this.ignored.add(key(word)) }

  addPersonalWord(word: string): void {
    const k = key(word)
    if (this.personal.has(k)) return
    this.personal.set(k, word)
    this.required().add(lookup(word))
  }

  removePersonalWord(word: string): void {
    const saved = this.personal.get(key(word))
    if (!saved) return
    this.personal.delete(key(word))
    this.required().remove(lookup(saved))
  }

  private required(): NspellLike {
    if (!this.spell) throw new Error('Spell dictionary is not loaded')
    return this.spell
  }
}
