// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api, DirEntry, SearchResponse, WalkResult, WorkspaceFilter } from '../../src/shared/types'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

vi.mock('split.js', () => ({
  default: vi.fn(() => ({ destroy: vi.fn() })),
}))

import { FolderMode } from '../../src/renderer/folderMode'
import { FindInFiles } from '../../src/renderer/findInFiles'
import { handleEscape } from '../../src/renderer/overlayManager'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function entry(name: string, root = 'C:\\workspace'): DirEntry {
  return { name, path: `${root}\\${name}`, isDir: false }
}

function mount(
  api: Partial<Api>,
  filter: () => WorkspaceFilter,
  onWorkspaceChanged: (rerun: boolean) => void = vi.fn(),
): FolderMode {
  document.body.innerHTML = '<div id="app"><div id="shell"><div id="sidebar"></div><div id="main"></div></div></div>'
  Object.defineProperty(window, 'api', { configurable: true, writable: true, value: api as Api })
  return new FolderMode({
    sidebarEl: document.getElementById('sidebar')!,
    mainEl: document.getElementById('main')!,
    openFile: vi.fn(),
    activePath: () => null,
    pickFolder: vi.fn(async () => {}),
    focusEditor: vi.fn(),
    filter,
    onWorkspaceChanged,
  })
}

function response(searchId: number, path: string, preview: string): SearchResponse {
  return {
    searchId,
    totalMatches: 1,
    truncated: false,
    files: [{ path, matches: [{ line: 1, column: 1, length: 3, preview }], truncated: false }],
  }
}

function baseApi(overrides: Partial<Api>): Partial<Api> {
  return {
    loadSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
    watchDir: vi.fn(async () => {}),
    updateSettings: vi.fn(async partial => ({ ...DEFAULT_SETTINGS, ...partial })),
    addRecentFolder: vi.fn(async path => [path]),
    loadRecentFolders: vi.fn(async () => []),
    clearRecentFolders: vi.fn(async () => {}),
    onDirChanged: vi.fn(),
    ...overrides,
  }
}

describe('FolderMode refresh integration', () => {
  beforeEach(() => {
    document.body.replaceChildren()
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => document.body.replaceChildren())

  it('drops stale work and publishes candidates and tree rows from the newest filter snapshot', async () => {
    const oldWalk = deferred<WalkResult>()
    const freshWalk = deferred<WalkResult>()
    const walkFiles = vi.fn()
      .mockImplementationOnce(() => oldWalk.promise)
      .mockImplementationOnce(() => freshWalk.promise)
    const readDir = vi.fn(async (...args: unknown[]) => {
      const passedFilter = args[2] as WorkspaceFilter | undefined
      return passedFilter?.excludePatterns[0] === 'fresh/**' ? [entry('fresh.ts')] : [entry('stale.ts')]
    })
    const api = baseApi({ walkFiles, readDir })
    let filter: WorkspaceFilter = { showAll: false, excludePatterns: ['old/**'] }
    const onWorkspaceChanged = vi.fn()
    const mode = mount(api, () => filter, onWorkspaceChanged)

    const opening = mode.openFolder('C:\\workspace')
    await vi.waitFor(() => expect(walkFiles).toHaveBeenCalledTimes(1))
    readDir.mockClear()

    filter = { showAll: true, excludePatterns: ['fresh/**'] }
    const settingsRefresh = mode.workspaceSettingsChanged()
    oldWalk.resolve({ files: ['C:\\workspace\\stale.ts'], truncated: false })
    await vi.waitFor(() => expect(walkFiles).toHaveBeenCalledTimes(2))
    filter.excludePatterns[0] = 'mutated-after-snapshot/**'
    freshWalk.resolve({ files: ['C:\\workspace\\fresh.ts'], truncated: true })
    await Promise.all([opening, settingsRefresh])

    expect(walkFiles.mock.calls).toEqual([
      ['C:\\workspace', { showAll: false, excludePatterns: ['old/**'] }],
      ['C:\\workspace', { showAll: true, excludePatterns: ['fresh/**'] }],
    ])
    expect(readDir).toHaveBeenCalledTimes(1)
    expect(readDir).toHaveBeenCalledWith(
      'C:\\workspace', 'C:\\workspace',
      { showAll: true, excludePatterns: ['fresh/**'] },
    )
    expect(document.querySelector('.sb-row')?.textContent).toContain('fresh.ts')
    expect(document.body.textContent).not.toContain('stale.ts')

    mode.openQuickOpen()
    expect(document.querySelector('.qo-row')?.textContent).toContain('fresh.ts')
    expect(document.querySelector('.qo-note')?.textContent).toContain('Index truncated')
    expect(onWorkspaceChanged.mock.calls).toEqual([[false], [true], [true]])
  })

  it('invalidates an active refresh when the folder closes', async () => {
    const walk = deferred<WalkResult>()
    const walkFiles = vi.fn(() => walk.promise)
    const readDir = vi.fn(async () => [entry('late.ts')])
    const api = baseApi({ walkFiles, readDir })
    const onWorkspaceChanged = vi.fn()
    const mode = mount(api, () => ({ showAll: false, excludePatterns: [] }), onWorkspaceChanged)

    const opening = mode.openFolder('C:\\workspace')
    await vi.waitFor(() => expect(walkFiles).toHaveBeenCalledOnce())
    let opened = false
    void opening.then(() => { opened = true })
    await Promise.resolve()
    expect(opened).toBe(false)
    readDir.mockClear()
    mode.closeFolder()
    walk.resolve({ files: ['C:\\workspace\\late.ts'], truncated: false })
    await opening

    expect(mode.root()).toBeNull()
    expect(readDir).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(document.querySelector('.sb-panel')).not.toBeNull())
    expect(document.body.textContent).not.toContain('late.ts')
    expect(onWorkspaceChanged.mock.calls).toEqual([[false], [true], [false], [true]])
  })

  it('waits for the committed folder root before rerunning a visible Find in Files query', async () => {
    vi.useFakeTimers()
    const bSettings = deferred<typeof DEFAULT_SETTINGS>()
    const oldA = deferred<SearchResponse>()
    const cancelSearch = vi.fn()
    const searchFiles = vi.fn((req: { root: string; searchId: number }) =>
      req.root === 'C:\\A'
        ? oldA.promise
        : Promise.resolve(response(req.searchId, 'C:\\B\\fresh.txt', 'fresh B result')))
    const api = baseApi({
      loadSettings: vi.fn()
        .mockResolvedValueOnce({ ...DEFAULT_SETTINGS })
        .mockImplementationOnce(() => bSettings.promise),
      walkFiles: vi.fn(async () => ({ files: [], truncated: false })),
      readDir: vi.fn(async () => []),
      searchFiles: searchFiles as Api['searchFiles'],
      cancelSearch,
    })
    let find!: FindInFiles
    const mode = mount(
      api,
      () => ({ showAll: false, excludePatterns: [] }),
      rerun => find.workspaceChanged(rerun),
    )
    find = new FindInFiles(document.getElementById('app')!, {
      root: () => mode.root(),
      filter: () => ({ showAll: false, excludePatterns: [] }),
      buffers: () => [],
      openMatch: vi.fn(),
      focusEditor: vi.fn(),
    })

    try {
      await mode.openFolder('C:\\A')
      find.open()
      const input = document.querySelector<HTMLInputElement>('[aria-label="Find in Files"]')!
      input.value = 'needle'; input.dispatchEvent(new Event('input'))
      await vi.advanceTimersByTimeAsync(151)
      expect(searchFiles.mock.calls.map(call => call[0].root)).toEqual(['C:\\A'])
      const aId = searchFiles.mock.calls[0][0].searchId

      const openingB = mode.openFolder('C:\\B')
      expect(cancelSearch).toHaveBeenCalledWith(aId)
      await vi.advanceTimersByTimeAsync(500)
      expect(searchFiles.mock.calls.map(call => call[0].root)).toEqual(['C:\\A'])

      oldA.resolve(response(aId, 'C:\\A\\old.txt', 'old A result'))
      await Promise.resolve(); await Promise.resolve()
      expect(document.body.textContent).not.toContain('old A result')

      bSettings.resolve({ ...DEFAULT_SETTINGS })
      await openingB
      expect(mode.root()).toBe('C:\\B')
      await vi.advanceTimersByTimeAsync(151)
      expect(searchFiles.mock.calls.map(call => call[0].root)).toEqual(['C:\\A', 'C:\\B'])
      expect(document.body.textContent).toContain('fresh B result')
      expect(document.body.textContent).not.toContain('old A result')
    } finally {
      handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
      vi.useRealTimers()
    }
  })

  it('clears folder A candidates and truncation synchronously while folder B opens', async () => {
    const bSettings = deferred<typeof DEFAULT_SETTINGS>()
    const staleAWalk = deferred<WalkResult>()
    const bWatch = deferred<void>()
    const bUpdate = deferred<typeof DEFAULT_SETTINGS>()
    const loadSettings = vi.fn()
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS })
      .mockImplementationOnce(() => bSettings.promise)
    const walkFiles = vi.fn()
      .mockResolvedValueOnce({ files: ['C:\\A\\seeded-a.ts'], truncated: true })
      .mockImplementationOnce(() => staleAWalk.promise)
      .mockResolvedValueOnce({ files: ['C:\\B\\fresh-b.ts'], truncated: false })
    const watchDir = vi.fn((root: string | null) =>
      root === 'C:\\B' ? bWatch.promise : Promise.resolve())
    const updateSettings = vi.fn((partial: { lastFolder?: string | null }) =>
      partial.lastFolder === 'C:\\B'
        ? bUpdate.promise
        : Promise.resolve({ ...DEFAULT_SETTINGS, ...partial }))
    const mode = mount(baseApi({
      loadSettings,
      walkFiles,
      watchDir,
      updateSettings: updateSettings as Api['updateSettings'],
      readDir: vi.fn(async () => []),
    }), () => ({ showAll: false, excludePatterns: [] }))

    await mode.openFolder('C:\\A')
    const staleRefresh = mode.workspaceSettingsChanged()
    await vi.waitFor(() => expect(walkFiles).toHaveBeenCalledTimes(2))

    const openingB = mode.openFolder('C:\\B')
    mode.openQuickOpen()
    const input = document.querySelector<HTMLInputElement>('#quick-open input')!
    expect(document.body.textContent).not.toContain('seeded-a.ts')
    expect(document.querySelector('.qo-note')).toBeNull()

    staleAWalk.resolve({ files: ['C:\\A\\late-a.ts'], truncated: true })
    await staleRefresh
    input.dispatchEvent(new Event('input'))
    expect(document.body.textContent).not.toContain('late-a.ts')
    expect(document.querySelector('.qo-note')).toBeNull()

    bSettings.resolve({ ...DEFAULT_SETTINGS })
    await vi.waitFor(() => expect(watchDir).toHaveBeenCalledWith('C:\\B'))
    input.dispatchEvent(new Event('input'))
    expect(document.querySelector('.qo-row')).toBeNull()
    bWatch.resolve()
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith(
      { lastFolder: 'C:\\B', sidebarVisible: true },
    ))
    input.dispatchEvent(new Event('input'))
    expect(document.querySelector('.qo-row')).toBeNull()

    bUpdate.resolve({ ...DEFAULT_SETTINGS, lastFolder: 'C:\\B', sidebarVisible: true })
    await openingB
    input.dispatchEvent(new Event('input'))
    expect(document.querySelector('.qo-row')?.textContent).toContain('fresh-b.ts')
    expect(document.body.textContent).not.toContain('seeded-a.ts')
    document.getElementById('quick-open')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })

  it('does not reopen or persist a folder when close wins during settings load', async () => {
    const settings = deferred<typeof DEFAULT_SETTINGS>()
    const watchDir = vi.fn(async () => {})
    const updateSettings = vi.fn(async partial => ({ ...DEFAULT_SETTINGS, ...partial }))
    const addRecentFolder = vi.fn(async (path: string) => [path])
    const api = baseApi({
      loadSettings: vi.fn(() => settings.promise),
      watchDir,
      updateSettings,
      addRecentFolder,
      walkFiles: vi.fn(async () => ({ files: [], truncated: false })),
      readDir: vi.fn(async () => []),
    })
    const mode = mount(api, () => ({ showAll: false, excludePatterns: [] }))

    const opening = mode.openFolder('C:\\late')
    mode.closeFolder()
    settings.resolve({ ...DEFAULT_SETTINGS })
    await opening

    expect(mode.root()).toBeNull()
    expect(watchDir.mock.calls).toEqual([[null]])
    expect(updateSettings.mock.calls.map(call => call[0])).toEqual([
      { lastFolder: null, sidebarVisible: false },
    ])
    expect(addRecentFolder).not.toHaveBeenCalled()
  })

  it('reasserts folder B when folder A watcher registration finishes late', async () => {
    const aWatch = deferred<void>()
    let watchedRoot: string | null = null
    const watchDir = vi.fn(async (root: string | null) => {
      if (root === 'C:\\A') await aWatch.promise
      watchedRoot = root
    })
    const updateSettings = vi.fn(async partial => ({ ...DEFAULT_SETTINGS, ...partial }))
    const addRecentFolder = vi.fn(async (path: string) => [path])
    const api = baseApi({
      watchDir,
      updateSettings,
      addRecentFolder,
      walkFiles: vi.fn(async root => ({ files: [`${root}\\file.ts`], truncated: false })),
      readDir: vi.fn(async () => []),
    })
    const mode = mount(api, () => ({ showAll: false, excludePatterns: [] }))

    const openingA = mode.openFolder('C:\\A')
    await vi.waitFor(() => expect(watchDir).toHaveBeenCalledWith('C:\\A'))
    const openingB = mode.openFolder('C:\\B')
    await vi.waitFor(() => expect(addRecentFolder).toHaveBeenCalledWith('C:\\B'))
    aWatch.resolve()
    await Promise.all([openingA, openingB])

    expect(mode.root()).toBe('C:\\B')
    expect(watchedRoot).toBe('C:\\B')
    expect(watchDir.mock.calls.at(-1)).toEqual(['C:\\B'])
    expect(updateSettings.mock.calls.map(call => call[0])).not.toContainEqual(
      { lastFolder: 'C:\\A', sidebarVisible: true },
    )
    expect(addRecentFolder.mock.calls).toEqual([['C:\\B']])
  })

  it('repairs folder B persistence when folder A settings update finishes late', async () => {
    const aUpdate = deferred<typeof DEFAULT_SETTINGS>()
    const watchDir = vi.fn(async () => {})
    let persistedRoot: string | null = null
    const updateSettings = vi.fn(async (
      partial: { lastFolder?: string | null; sidebarVisible?: boolean },
    ) => {
      if (partial.lastFolder === 'C:\\A') await aUpdate.promise
      persistedRoot = partial.lastFolder ?? persistedRoot
      return { ...DEFAULT_SETTINGS, ...partial }
    })
    const addRecentFolder = vi.fn(async (path: string) => [path])
    const api = baseApi({
      watchDir,
      updateSettings: updateSettings as Api['updateSettings'],
      addRecentFolder,
      walkFiles: vi.fn(async root => ({ files: [`${root}\\file.ts`], truncated: false })),
      readDir: vi.fn(async () => []),
    })
    const mode = mount(api, () => ({ showAll: false, excludePatterns: [] }))

    const openingA = mode.openFolder('C:\\A')
    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith(
      { lastFolder: 'C:\\A', sidebarVisible: true },
    ))
    const openingB = mode.openFolder('C:\\B')
    await vi.waitFor(() => expect(addRecentFolder).toHaveBeenCalledWith('C:\\B'))
    aUpdate.resolve({ ...DEFAULT_SETTINGS, lastFolder: 'C:\\A', sidebarVisible: true })
    await Promise.all([openingA, openingB])

    expect(mode.root()).toBe('C:\\B')
    expect(persistedRoot).toBe('C:\\B')
    expect(updateSettings.mock.calls.at(-1)?.[0]).toEqual(
      { lastFolder: 'C:\\B', sidebarVisible: true },
    )
    expect(addRecentFolder.mock.calls).toEqual([['C:\\B']])
  })
})
