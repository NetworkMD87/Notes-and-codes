export type EolMode = 'LF' | 'CRLF'
export type Encoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'

export interface SearchOptions { caseSensitive: boolean; wholeWord: boolean }

export interface SearchMatch {
  line: number
  column: number
  length: number
  preview: string
}

export interface SearchFileResult {
  path: string           // absolute path; '' for an untitled buffer
  title?: string         // tab title, only for untitled buffers
  matches: SearchMatch[]
  truncated: boolean     // per-file cap hit
}

export interface SearchRequest {
  root: string
  query: string
  opts: SearchOptions
  skipPaths: string[]
  showAll: boolean
  searchId: number
}

export interface SearchResponse {
  files: SearchFileResult[]
  totalMatches: number
  truncated: boolean     // total cap hit, or the file index itself was truncated
  searchId: number
}

export interface FileVersion { ts: number; content: string; eol: EolMode; encoding: Encoding }

export interface DirEntry { name: string; path: string; isDir: boolean }
/** Quick-open file index. `truncated` is true when the walk hit its file cap, so the UI
 *  can hint that some files may not appear. */
export interface WalkResult { files: string[]; truncated: boolean }

export interface Snippet { id: string; name: string; body: string }

// One canonical 18-colour palette drives the accent swatches AND the highlighter.
export const ACCENT_PALETTE: { name: string; value: string }[] = [
  { name: 'Red', value: '#dc2626' }, { name: 'Crimson', value: '#e11d48' },
  { name: 'Pink', value: '#db2777' }, { name: 'Fuchsia', value: '#c026d3' },
  { name: 'Purple', value: '#9333ea' }, { name: 'Violet', value: '#7c3aed' },
  { name: 'Indigo', value: '#4f46e5' }, { name: 'Blue', value: '#0a84ff' },
  { name: 'Sky', value: '#0ea5e9' }, { name: 'Cyan', value: '#06b6d4' },
  { name: 'Teal', value: '#14b8a6' }, { name: 'Emerald', value: '#10b981' },
  { name: 'Green', value: '#16a34a' }, { name: 'Lime', value: '#65a30d' },
  { name: 'Yellow', value: '#eab308' }, { name: 'Amber', value: '#f59e0b' },
  { name: 'Orange', value: '#ea580c' }, { name: 'Slate', value: '#64748b' },
]

// Highlight colour keys = ACCENT_PALETTE names lowercased. Explicit tuple (not derived) so the
// union type stays literal; kept aligned with ACCENT_PALETTE by tests/unit/palette.test.ts.
export const HIGHLIGHT_COLOURS = [
  'red', 'crimson', 'pink', 'fuchsia', 'purple', 'violet', 'indigo', 'blue', 'sky',
  'cyan', 'teal', 'emerald', 'green', 'lime', 'yellow', 'amber', 'orange', 'slate',
] as const
export type HighlightColour = typeof HIGHLIGHT_COLOURS[number]

/** Solid highlight hexes, keyed by lowercased palette name. Single source: ACCENT_PALETTE. */
export const HL_HEX = Object.fromEntries(
  ACCENT_PALETTE.map(c => [c.name.toLowerCase(), c.value]),
) as Record<HighlightColour, string>

export interface Highlight { start: number; end: number; colour: HighlightColour }

export interface BufferState {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: EolMode
  encoding: Encoding
  dirty: boolean
  highlights?: Highlight[]
  /** On-disk mtime when we last read or wrote this file — the baseline for the on-save
   *  overwrite guard. Undefined for untitled buffers, and for sessions written before the
   *  guard existed, in which case the first save runs unchecked exactly as it used to. */
  diskMtime?: number
}

export type ThemeMode = 'light' | 'dark' | 'follow-os'

export interface Settings {
  theme: ThemeMode
  autoSaveSession: boolean
  contextMenuEnabled: boolean
  windowBounds: { width: number; height: number } | null
  alwaysOnTop: boolean
  openAtLogin: boolean
  globalHotkey: string
  fontSize: number
  themeId: string
  accent: string | null
  fontFamily: string
  uiFontFamily: string
  fontLigatures: boolean
  showAllFiles: boolean
  restoreFolderOnLaunch: boolean
  autoSaveToDisk: boolean
  formatOnSave: boolean
  lastFolder: string | null
  sidebarVisible: boolean
  sidebarWidth: number
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'follow-os',
  autoSaveSession: true,
  contextMenuEnabled: false,
  windowBounds: null,
  alwaysOnTop: false,
  openAtLogin: false,
  globalHotkey: 'CommandOrControl+Shift+Space',
  fontSize: 14,
  themeId: 'dark',
  accent: null,
  fontFamily: 'JetBrains Mono',
  uiFontFamily: 'System',
  fontLigatures: true,
  showAllFiles: false,
  restoreFolderOnLaunch: true,
  autoSaveToDisk: false,
  formatOnSave: false,
  lastFolder: null,
  sidebarVisible: false,
  sidebarWidth: 240
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
  /** On-disk mtime at the moment we read it — the baseline for the on-save overwrite guard. */
  mtimeMs: number
}

/** `readFile` result — refused (too large / binary) files carry a user-facing reason
 *  instead of a file, so the renderer can toast it without opening a garbage buffer. */
export type ReadResult = { ok: true; file: OpenedFile } | { ok: false; reason: string }

/** `writeFile` result. `ok:false` means ONLY "refused because the file changed on disk since we
 *  last read/wrote it" — it is not a general failure channel. Real write failures (disk full,
 *  permissions) still throw, as they always have, so the existing save-failure toasts keep working.
 *  On `ok:true`, `mtimeMs` is undefined only if the post-write stat failed; the bytes still landed. */
export type WriteResult =
  | { ok: true; mtimeMs: number | undefined }
  | { ok: false; reason: 'stale' }

export interface ExportResult { ok: boolean; canceled?: boolean; path?: string }

/** `setGlobalHotkey` result. `active` is what is actually bound after the call — the new
 *  accelerator on success, the restored previous one on failure, or '' if nothing is bound. */
export interface HotkeyResult { ok: boolean; active: string }

export interface Api {
  readFile(path: string): Promise<ReadResult>
  writeFile(path: string, content: string, eol: EolMode, encoding: Encoding, expectedMtime?: number): Promise<WriteResult>
  loadSession(): Promise<SessionData>
  saveSession(data: SessionData): Promise<void>
  loadSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  /** Merge a partial into the stored settings atomically in main (no renderer
   *  read-modify-write race). Prefer this over loadSettings()+saveSettings(). */
  updateSettings(partial: Partial<Settings>): Promise<Settings>
  setContextMenu(enabled: boolean): Promise<void>
  /** Registers/removes the Windows startup entry. Persisting `openAtLogin` is separate
   *  (updateSettings) — this performs only the OS side-effect, like setContextMenu. */
  setLoginItem(enabled: boolean): Promise<void>
  /** Rebind the summon hotkey. '' clears it. Main persists on success only. */
  setGlobalHotkey(accel: string): Promise<HotkeyResult>
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
  onFlushAndQuit(cb: () => void): void
  onMenuCommand(cb: (id: string) => void): void
  onAppNotify(cb: (msg: string) => void): void
  /** Fires whenever the BrowserWindow loses OS focus — hide-to-tray, the summon hotkey,
   *  minimise, and alt-tab all take this same path in the main process (`win.on('blur', …)`),
   *  so a renderer-side widget that only works while the window can receive keystrokes (e.g.
   *  the hotkey recorder) has one uniform signal to tear itself down on. */
  onWindowBlur(cb: () => void): void
  snapshotHistory(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void>
  listHistory(path: string): Promise<{ ts: number }[]>
  getHistory(path: string, ts: number): Promise<FileVersion | null>
  loadHighlights(path: string): Promise<Highlight[]>
  saveHighlights(path: string, highlights: Highlight[]): Promise<void>
  openFolderDialog(): Promise<string | null>
  readDir(path: string, showAll: boolean): Promise<DirEntry[]>
  walkFiles(path: string, showAll: boolean): Promise<WalkResult>
  createFile(path: string): Promise<boolean>
  createFolder(path: string): Promise<boolean>
  renamePath(from: string, to: string): Promise<boolean>
  trashPath(path: string): Promise<boolean>
  watchDir(path: string | null): Promise<void>
  onDirChanged(cb: () => void): void
  dirExists(path: string): Promise<boolean>
  exportHtml(html: string, suggestedName: string, sourcePath: string | null): Promise<ExportResult>
  exportPdf(html: string, suggestedName: string, sourcePath: string | null): Promise<ExportResult>
  getAppVersion(): Promise<string>
  openExternal(url: string): Promise<void>
}
