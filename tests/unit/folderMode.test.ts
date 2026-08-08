// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api, DirEntry, WalkResult, WorkspaceFilter } from '../../src/shared/types'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

vi.mock('split.js', () => ({
  default: vi.fn(() => ({ destroy: vi.fn() })),
}))

import { FolderMode } from '../../src/renderer/folderMode'

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

function mount(api: Partial<Api>, filter: () => WorkspaceFilter): FolderMode {
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
  })
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
  beforeEach(() => document.body.replaceChildren())
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
    const mode = mount(api, () => filter)

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
  })

  it('invalidates an active refresh when the folder closes', async () => {
    const walk = deferred<WalkResult>()
    const walkFiles = vi.fn(() => walk.promise)
    const readDir = vi.fn(async () => [entry('late.ts')])
    const api = baseApi({ walkFiles, readDir })
    const mode = mount(api, () => ({ showAll: false, excludePatterns: [] }))

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
  })
})
