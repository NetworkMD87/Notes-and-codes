import { NspellEngine } from './spellEngine'
import { extractSpellWords } from '../shared/spellText'
import type { SpellWorkerRequest, SpellWorkerResponse } from '../shared/spell'

const engine = new NspellEngine()

async function dispatch(request: SpellWorkerRequest): Promise<SpellWorkerResponse> {
  try {
    switch (request.type) {
      case 'load':
        await engine.load(request.locale, request.personalWords)
        return { id: request.id, ok: true, type: 'loaded' }
      case 'check':
        return {
          id: request.id,
          ok: true,
          type: 'checked',
          result: {
            generation: request.batch.generation,
            documents: request.batch.documents.map(document => ({
              modelUri: document.modelUri,
              modelVersion: document.modelVersion,
              issues: engine.check(extractSpellWords(document.text, document.languageId))
            }))
          }
        }
      case 'suggest':
        return {
          id: request.id,
          ok: true,
          type: 'suggested',
          suggestions: engine.suggest(request.word, request.limit)
        }
      case 'ignore':
        engine.ignoreForSession(request.word)
        return { id: request.id, ok: true, type: 'mutated' }
      case 'personal:add':
        engine.addPersonalWord(request.word)
        return { id: request.id, ok: true, type: 'mutated' }
      case 'personal:remove':
        engine.removePersonalWord(request.word)
        return { id: request.id, ok: true, type: 'mutated' }
    }
  } catch {
    const error = request.type === 'load'
      ? 'load-failed'
      : request.type === 'check' ? 'check-failed' : 'worker-failed'
    return { id: request.id, ok: false, error }
  }
}

self.addEventListener('message', (event: MessageEvent) => {
  const request = event.data as SpellWorkerRequest
  void dispatch(request).then(response => self.postMessage(response))
})
