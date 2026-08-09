import {
  DEFAULT_SETTINGS,
  type SessionData,
  type Settings,
  type Snippet,
} from '../shared/types'

export type StartupReadName =
  | 'settings'
  | 'locale'
  | 'personalWords'
  | 'clipboard'
  | 'snippets'
  | 'session'

export interface StartupReadDeps {
  loadSettings(): Promise<Settings>
  getSystemLocale(): Promise<string>
  listPersonalWords(): Promise<string[]>
  loadClipboardHistory(): Promise<string[]>
  loadSnippets(): Promise<Snippet[]>
  loadSession(): Promise<SessionData>
}

export interface StartupReadResult {
  settings: Settings
  systemLocale: string
  personalWords: string[]
  clipboardHistory: string[]
  snippets: Snippet[]
  session: SessionData
  failures: StartupReadName[]
}

export async function loadStartupState(deps: StartupReadDeps): Promise<StartupReadResult> {
  const failures: StartupReadName[] = []
  const read = async <T>(name: StartupReadName, load: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await Promise.resolve().then(load)
    } catch (error) {
      failures.push(name)
      console.error(`[startup] ${name} read failed`, error)
      return fallback
    }
  }

  const [settings, systemLocale, personalWords, clipboardHistory, snippets, session] = await Promise.all([
    read('settings', deps.loadSettings, { ...DEFAULT_SETTINGS }),
    read('locale', deps.getSystemLocale, 'en-GB'),
    read('personalWords', deps.listPersonalWords, []),
    read('clipboard', deps.loadClipboardHistory, []),
    read('snippets', deps.loadSnippets, []),
    read('session', deps.loadSession, { buffers: [], activeId: null }),
  ])

  return { settings, systemLocale, personalWords, clipboardHistory, snippets, session, failures }
}
