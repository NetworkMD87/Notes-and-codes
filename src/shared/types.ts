export type EolMode = 'LF' | 'CRLF'
export type Encoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'

export interface FileVersion { ts: number; content: string; eol: EolMode; encoding: Encoding }

export interface Snippet { id: string; name: string; body: string }

export interface BufferState {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: EolMode
  encoding: Encoding
  dirty: boolean
}

export type ThemeMode = 'light' | 'dark' | 'follow-os'

export interface Settings {
  theme: ThemeMode
  autoSaveSession: boolean
  contextMenuEnabled: boolean
  windowBounds: { width: number; height: number } | null
  alwaysOnTop: boolean
  globalHotkey: string
  fontSize: number
  themeId: string
  accent: string | null
  fontFamily: string
  fontLigatures: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'follow-os',
  autoSaveSession: true,
  contextMenuEnabled: false,
  windowBounds: null,
  alwaysOnTop: false,
  globalHotkey: 'CommandOrControl+Shift+Space',
  fontSize: 14,
  themeId: 'dark',
  accent: null,
  fontFamily: 'JetBrains Mono',
  fontLigatures: true
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
  encoding: Encoding
}

export interface Api {
  readFile(path: string): Promise<OpenedFile>
  writeFile(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void>
  loadSession(): Promise<SessionData>
  saveSession(data: SessionData): Promise<void>
  loadSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  setContextMenu(enabled: boolean): Promise<void> // implemented in Task 14
  onOpenFile(cb: (path: string) => void): void     // implemented in Task 13
  saveAsDialog(): Promise<string | null>
  openDialog(): Promise<string | null>
  clipboardRead(): Promise<string>
  loadClipboardHistory(): Promise<string[]>
  saveClipboardHistory(entries: string[]): Promise<void>
  loadSnippets(): Promise<Snippet[]>
  saveSnippets(list: Snippet[]): Promise<void>
  setAlwaysOnTop(enabled: boolean): Promise<void>
  loadRecentFiles(): Promise<string[]>
  addRecentFile(path: string): Promise<string[]>
  clearRecentFiles(): Promise<void>
  pathForDroppedFile(file: File): string
  watchPaths(paths: string[]): Promise<void>
  onFileChanged(cb: (path: string) => void): void
  setDirtyCount(n: number): void
  hideWindow(): void
  quitNow(): void
  onSaveAllAndQuit(cb: () => void): void
  onMenuCommand(cb: (id: string) => void): void
  snapshotHistory(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void>
  listHistory(path: string): Promise<{ ts: number }[]>
  getHistory(path: string, ts: number): Promise<FileVersion | null>
}
