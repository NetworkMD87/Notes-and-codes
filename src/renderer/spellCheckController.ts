import * as monaco from 'monaco-editor'
import {
  SpellCheckCore,
  type SpellActionArgs,
  type SpellCheckCoreDeps,
} from './spellCheckCore'

const REPLACE_COMMAND = 'notesAndCodes.spell.replace'
const IGNORE_COMMAND = 'notesAndCodes.spell.ignore'
const ADD_COMMAND = 'notesAndCodes.spell.addPersonal'
const QUICK_FIX = 'quickfix'

function isSpellActionArgs(value: unknown): value is SpellActionArgs {
  if (!value || typeof value !== 'object') return false
  const action = value as Partial<SpellActionArgs>
  return typeof action.modelUri === 'string'
    && Number.isInteger(action.modelVersion)
    && Number.isInteger(action.start)
    && Number.isInteger(action.end)
    && typeof action.word === 'string'
    && (action.replacement === undefined || typeof action.replacement === 'string')
}

const emptyActions = (): monaco.languages.CodeActionList => ({
  actions: [],
  dispose: () => undefined,
})

export class SpellCheckController {
  private readonly core: SpellCheckCore
  private readonly registrations: monaco.IDisposable[]
  private disposed = false

  constructor(deps: SpellCheckCoreDeps) {
    this.core = new SpellCheckCore(deps)
    this.registrations = [
      monaco.languages.registerCodeActionProvider(['plaintext', 'markdown'], {
        provideCodeActions: (model, range, _context, token) =>
          this.actionsForCurrentIssue(model, range, token),
      }, { providedCodeActionKinds: [QUICK_FIX] }),
      monaco.editor.registerCommand(REPLACE_COMMAND, (_accessor, action: unknown) => {
        if (isSpellActionArgs(action)) this.core.replace(action)
      }),
      monaco.editor.registerCommand(IGNORE_COMMAND, (_accessor, action: unknown) => {
        if (isSpellActionArgs(action)) void this.core.ignore(action)
      }),
      monaco.editor.registerCommand(ADD_COMMAND, (_accessor, action: unknown) => {
        if (isSpellActionArgs(action)) void this.core.add(action)
      }),
    ]
  }

  initialize(personalWords: string[]): Promise<void> { return this.core.initialize(personalWords) }
  schedule(): void { this.core.schedule() }
  refreshNow(): void { this.core.refreshNow() }
  applySettings(): Promise<void> { return this.core.applySettings() }
  personalWordsChanged(words: string[]): Promise<void> { return this.core.personalWordsChanged(words) }
  workerRestarted(): void { this.core.workerRestarted() }
  workerFailed(): void { this.core.workerFailed() }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const registration of this.registrations) registration.dispose()
    this.core.dispose()
  }

  private async actionsForCurrentIssue(
    model: monaco.editor.ITextModel,
    range: monaco.Range,
    token: monaco.CancellationToken,
  ): Promise<monaco.languages.CodeActionList> {
    if (this.disposed || token.isCancellationRequested) return emptyActions()
    const modelUri = model.uri.toString()
    const modelVersion = model.getVersionId()
    const current = this.core.currentIssue({
      modelUri,
      modelVersion,
      startOffset: model.getOffsetAt(range.getStartPosition()),
      endOffset: model.getOffsetAt(range.getEndPosition()),
    })
    if (!current) return emptyActions()

    const action: SpellActionArgs = {
      modelUri,
      modelVersion,
      start: current.start,
      end: current.end,
      word: current.text,
    }
    const suggestions = await this.core.suggestions(action)
    if (this.disposed || token.isCancellationRequested) return emptyActions()

    const actions: monaco.languages.CodeAction[] = suggestions.map((replacement, index) => ({
      title: replacement,
      kind: QUICK_FIX,
      isPreferred: index === 0,
      command: {
        id: REPLACE_COMMAND,
        title: replacement,
        arguments: [{ ...action, replacement }],
      },
    }))
    actions.push(
      {
        title: 'Ignore for this session',
        kind: QUICK_FIX,
        command: { id: IGNORE_COMMAND, title: 'Ignore for this session', arguments: [action] },
      },
      {
        title: 'Add to personal dictionary',
        kind: QUICK_FIX,
        command: { id: ADD_COMMAND, title: 'Add to personal dictionary', arguments: [action] },
      },
    )
    return { actions, dispose: () => undefined }
  }
}
