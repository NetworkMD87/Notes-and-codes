export type EolMode = 'LF' | 'CRLF'

export interface BufferState {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: EolMode
  dirty: boolean
}

export type ThemeMode = 'light' | 'dark' | 'follow-os'

export interface Settings {
  theme: ThemeMode
  autoSaveSession: boolean
  contextMenuEnabled: boolean
  windowBounds: { width: number; height: number } | null
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'follow-os',
  autoSaveSession: true,
  contextMenuEnabled: false,
  windowBounds: null
}

export interface SessionData {
  buffers: BufferState[]
  activeId: string | null
}

/** Result of opening a file from disk (Task 5). */
export interface OpenedFile {
  filePath: string
  content: string
  eol: EolMode
}

export interface Api {
  readFile(path: string): Promise<OpenedFile>
  writeFile(path: string, content: string, eol: EolMode): Promise<void>
  loadSession(): Promise<SessionData>
  saveSession(data: SessionData): Promise<void>
  loadSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  setContextMenu(enabled: boolean): Promise<void> // implemented in Task 14
  onOpenFile(cb: (path: string) => void): void     // implemented in Task 13
  saveAsDialog(): Promise<string | null>
  openDialog(): Promise<string | null>
}
