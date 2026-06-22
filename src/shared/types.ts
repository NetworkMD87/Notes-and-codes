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
