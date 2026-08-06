export type SpellCheckLanguage = 'system' | 'en-GB' | 'en-US'
export type ResolvedSpellLocale = 'en-GB' | 'en-US'

export interface SpellWord {
  text: string
  start: number // UTF-16 offset, inclusive
  end: number   // UTF-16 offset, exclusive
}

export interface SpellIssue extends SpellWord {}

export interface SpellDocument {
  modelUri: string
  modelVersion: number
  languageId: string
  text: string
}

export interface SpellDocumentResult {
  modelUri: string
  modelVersion: number
  issues: SpellIssue[]
}

export interface SpellBatch {
  generation: number
  documents: SpellDocument[]
}

export interface SpellBatchResult {
  generation: number
  documents: SpellDocumentResult[]
}
