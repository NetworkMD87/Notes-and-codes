import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type SessionData, type Snippet } from '../../src/shared/types'
import { loadStartupState, type StartupReadDeps } from '../../src/renderer/startupReads'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('loadStartupState', () => {
  it('starts all six reads before awaiting any one of them', async () => {
    const started: string[] = []
    const session = deferred<SessionData>()
    const result = loadStartupState({
      loadSettings: async () => { started.push('settings'); return { ...DEFAULT_SETTINGS, themeId: 'light' } },
      getSystemLocale: async () => { started.push('locale'); return 'en-US' },
      listPersonalWords: async () => { started.push('words'); return ['Codex'] },
      loadClipboardHistory: async () => { started.push('clipboard'); return ['clip'] },
      loadSnippets: async () => { started.push('snippets'); return [{ id: 's', name: 'S', body: 'body' }] },
      loadSession: () => { started.push('session'); return session.promise },
    })

    await Promise.resolve()
    expect(started).toEqual(['settings', 'locale', 'words', 'clipboard', 'snippets', 'session'])

    session.resolve({ buffers: [], activeId: null })
    await expect(result).resolves.toMatchObject({ failures: [], systemLocale: 'en-US' })
  })

  it('falls back only the rejected read and reports one failure name', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const result = await loadStartupState({
        loadSettings: async () => ({ ...DEFAULT_SETTINGS, themeId: 'light' }),
        getSystemLocale: async () => 'en-US',
        listPersonalWords: async () => ['Codex'],
        loadClipboardHistory: async () => ['clip'],
        loadSnippets: async () => { throw new Error('broken snippets') },
        loadSession: async () => ({ buffers: [], activeId: null }),
      })

      expect(result.settings.themeId).toBe('light')
      expect(result.systemLocale).toBe('en-US')
      expect(result.personalWords).toEqual(['Codex'])
      expect(result.clipboardHistory).toEqual(['clip'])
      expect(result.snippets).toEqual([])
      expect(result.session).toEqual({ buffers: [], activeId: null })
      expect(result.failures).toEqual(['snippets'])
      expect(error).toHaveBeenCalledWith('[startup] snippets read failed', expect.any(Error))
    } finally {
      error.mockRestore()
    }
  })

  it('uses the exact default for every independently failed read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reject = async (): Promise<never> => { throw new Error('unavailable') }
    const deps: StartupReadDeps = {
      loadSettings: reject,
      getSystemLocale: reject,
      listPersonalWords: reject,
      loadClipboardHistory: reject,
      loadSnippets: reject,
      loadSession: reject,
    }

    try {
      await expect(loadStartupState(deps)).resolves.toEqual({
        settings: DEFAULT_SETTINGS,
        systemLocale: 'en-GB',
        personalWords: [],
        clipboardHistory: [],
        snippets: [] as Snippet[],
        session: { buffers: [], activeId: null },
        failures: ['settings', 'locale', 'personalWords', 'clipboard', 'snippets', 'session'],
      })
    } finally {
      error.mockRestore()
    }
  })

  it('maps results to a stable contract when reads resolve out of order', async () => {
    const settings = deferred<Awaited<ReturnType<StartupReadDeps['loadSettings']>>>()
    const locale = deferred<string>()
    const words = deferred<string[]>()
    const clipboard = deferred<string[]>()
    const snippets = deferred<Snippet[]>()
    const session = deferred<SessionData>()
    const result = loadStartupState({
      loadSettings: () => settings.promise,
      getSystemLocale: () => locale.promise,
      listPersonalWords: () => words.promise,
      loadClipboardHistory: () => clipboard.promise,
      loadSnippets: () => snippets.promise,
      loadSession: () => session.promise,
    })

    session.resolve({ buffers: [], activeId: null })
    snippets.resolve([{ id: 'snippet', name: 'Snippet', body: 'body' }])
    clipboard.resolve(['clip'])
    words.resolve(['Codex'])
    locale.resolve('en-US')
    settings.resolve({ ...DEFAULT_SETTINGS, themeId: 'light' })

    await expect(result).resolves.toMatchObject({
      settings: { themeId: 'light' },
      systemLocale: 'en-US',
      personalWords: ['Codex'],
      clipboardHistory: ['clip'],
      snippets: [{ id: 'snippet' }],
      session: { buffers: [], activeId: null },
      failures: [],
    })
  })
})
