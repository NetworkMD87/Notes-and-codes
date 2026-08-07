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

export type SpellWorkerRequest =
  | { id: number; type: 'load'; locale: ResolvedSpellLocale; personalWords: string[] }
  | { id: number; type: 'check'; batch: SpellBatch }
  | { id: number; type: 'suggest'; word: string; limit: number }
  | { id: number; type: 'ignore'; word: string }
  | { id: number; type: 'personal:add'; word: string }
  | { id: number; type: 'personal:remove'; word: string }

export type SpellWorkerResponse =
  | { id: number; ok: true; type: 'loaded' | 'mutated' }
  | { id: number; ok: true; type: 'checked'; result: SpellBatchResult }
  | { id: number; ok: true; type: 'suggested'; suggestions: string[] }
  | { id: number; ok: false; error: 'load-failed' | 'check-failed' | 'worker-failed' }
