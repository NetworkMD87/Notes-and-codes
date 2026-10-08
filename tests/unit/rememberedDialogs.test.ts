import { describe, expect, it, vi } from 'vitest'
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron'
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/types'
import { RememberedDialogs } from '../../src/main/rememberedDialogs'

const fallback = 'C:\\Users\\Test\\Documents'

function setup(initial: Partial<Settings> = {}, failUpdate = false) {
  let value: Settings = { ...DEFAULT_SETTINGS, ...initial }
  const settings = {
    load: vi.fn(async () => value),
    update: vi.fn(async (partial: Partial<Settings>) => {
      if (failUpdate) throw new Error('settings write failed')
      value = { ...value, ...partial }
      return value
    }),
  }
  const open = vi.fn<(_options: OpenDialogOptions) => Promise<OpenDialogReturnValue>>()
  const save = vi.fn<(_parent: null, _options: SaveDialogOptions) => Promise<SaveDialogReturnValue>>()
  const dialogs = new RememberedDialogs(settings, fallback, { open, save })
  return { dialogs, settings, open, save, getSettings: () => value }
}

describe('RememberedDialogs', () => {
  it('uses Documents on first use and does not remember a canceled file dialog', async () => {
    const { dialogs, open, settings } = setup()
    open.mockResolvedValue({ canceled: true, filePaths: [] })

    await dialogs.openFile()

    expect(open).toHaveBeenCalledWith({ properties: ['openFile'], defaultPath: fallback })
    expect(settings.update).not.toHaveBeenCalled()
  })

  it('remembers the file parent and selected folder independently', async () => {
    const { dialogs, open, settings } = setup()
    open.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\work\\notes.txt'] })
    open.mockResolvedValueOnce({ canceled: false, filePaths: ['D:\\projects'] })
    open.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    open.mockResolvedValueOnce({ canceled: true, filePaths: [] })

    await dialogs.openFile()
    await dialogs.openFolder()
    await dialogs.openFile()
    await dialogs.openFolder()

    expect(open.mock.calls[0][0].defaultPath).toBe(fallback)
    expect(open.mock.calls[1][0].defaultPath).toBe(fallback)
    expect(open.mock.calls[2][0].defaultPath).toBe('C:\\work')
    expect(open.mock.calls[3][0].defaultPath).toBe('D:\\projects')
    expect(settings.update).toHaveBeenNthCalledWith(1, { lastOpenDirectory: 'C:\\work' })
    expect(settings.update).toHaveBeenNthCalledWith(2, { lastFolderDirectory: 'D:\\projects' })
  })

  it('loads remembered directories after a new helper is created', async () => {
    const initial = { lastOpenDirectory: 'E:\\archive' }
    const { dialogs, open, getSettings } = setup(initial)
    open.mockResolvedValue({ canceled: true, filePaths: [] })
    await dialogs.openFile()

    const restarted = setup(getSettings())
    restarted.open.mockResolvedValue({ canceled: true, filePaths: [] })
    await restarted.dialogs.openFile()

    expect(restarted.open).toHaveBeenCalledWith({
      properties: ['openFile'], defaultPath: 'E:\\archive',
    })
  })

  it('keeps an explicit absolute save path and remembers its result directory', async () => {
    const { dialogs, save, settings } = setup({ lastSaveDirectory: 'C:\\old' })
    save.mockResolvedValue({ canceled: false, filePath: 'F:\\exports\\page.html' })

    await dialogs.save(null, { defaultPath: 'D:\\source\\page.html' })

    expect(save.mock.calls[0][1].defaultPath).toBe('D:\\source\\page.html')
    expect(settings.update).toHaveBeenCalledWith({ lastSaveDirectory: 'F:\\exports' })
  })

  it('places a relative suggested filename in the remembered save directory', async () => {
    const { dialogs, save } = setup({ lastSaveDirectory: 'C:\\exports' })
    save.mockResolvedValue({ canceled: true, filePath: '' })

    await dialogs.save(null, { defaultPath: 'report.pdf', title: 'Export' })

    expect(save.mock.calls[0][1]).toEqual({ defaultPath: 'C:\\exports\\report.pdf', title: 'Export' })
  })

  it('returns the native result and remembers a valid choice in memory when persistence fails', async () => {
    const { dialogs, open, settings } = setup({}, true)
    const result = { canceled: false, filePaths: ['C:\\notes\\draft.txt'] }
    open.mockResolvedValue(result)

    await expect(dialogs.openFile()).resolves.toBe(result)
    await dialogs.openFile()

    expect(open.mock.calls[1][0].defaultPath).toBe('C:\\notes')
    expect(settings.update).toHaveBeenCalledTimes(2)
  })
})
