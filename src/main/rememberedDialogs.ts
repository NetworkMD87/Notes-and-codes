import { dirname, isAbsolute, join } from 'node:path'
import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
  SaveDialogOptions,
  SaveDialogReturnValue,
} from 'electron'
import type { Settings } from '../shared/types'

type RememberedDirectoryKey = 'lastOpenDirectory' | 'lastSaveDirectory' | 'lastFolderDirectory'

export interface RememberedDialogSettings {
  load(): Promise<Settings>
  update(partial: Partial<Settings>): Promise<Settings>
}

export interface RememberedDialogNativeMethods {
  open(options: OpenDialogOptions): Promise<OpenDialogReturnValue>
  save(parent: BrowserWindow | null, options: SaveDialogOptions): Promise<SaveDialogReturnValue>
}

/** Applies remembered locations to Electron's native dialogs and saves successful choices. */
export class RememberedDialogs {
  private readonly recent = new Map<RememberedDirectoryKey, string>()

  constructor(
    private readonly settings: RememberedDialogSettings,
    private readonly fallbackDirectory: string,
    private readonly native: RememberedDialogNativeMethods,
  ) {}

  async openFile(): Promise<OpenDialogReturnValue> {
    const result = await this.native.open({
      properties: ['openFile'],
      defaultPath: await this.directoryFor('lastOpenDirectory'),
    })
    const path = !result.canceled ? result.filePaths[0] : undefined
    if (path && isAbsolute(path)) await this.remember('lastOpenDirectory', dirname(path))
    return result
  }

  async openFolder(): Promise<OpenDialogReturnValue> {
    const result = await this.native.open({
      properties: ['openDirectory'],
      defaultPath: await this.directoryFor('lastFolderDirectory'),
    })
    const path = !result.canceled ? result.filePaths[0] : undefined
    if (path && isAbsolute(path)) await this.remember('lastFolderDirectory', path)
    return result
  }

  async save(parent: BrowserWindow | null, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
    const defaultPath = options.defaultPath
    const resolvedDefaultPath = typeof defaultPath === 'string' && isAbsolute(defaultPath)
      ? defaultPath
      : join(await this.directoryFor('lastSaveDirectory'),
        typeof defaultPath === 'string' ? defaultPath : '')
    const result = await this.native.save(parent, { ...options, defaultPath: resolvedDefaultPath })
    if (!result.canceled && result.filePath && isAbsolute(result.filePath)) {
      await this.remember('lastSaveDirectory', dirname(result.filePath))
    }
    return result
  }

  private async directoryFor(key: RememberedDirectoryKey): Promise<string> {
    const recent = this.recent.get(key)
    if (recent) return recent
    try {
      const stored = (await this.settings.load())[key]
      if (typeof stored === 'string' && isAbsolute(stored)) return stored
    } catch {
      // Native dialog still works with the app's default location if settings cannot be read.
    }
    return this.fallbackDirectory
  }

  private async remember(key: RememberedDirectoryKey, directory: string): Promise<void> {
    if (!isAbsolute(directory)) return
    // Keep the successful choice available during this run even if settings cannot be written.
    this.recent.set(key, directory)
    try {
      await this.settings.update({ [key]: directory })
    } catch {
      // A valid native dialog result remains successful when persistence fails.
    }
  }
}
