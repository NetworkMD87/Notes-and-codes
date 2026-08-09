// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Api, SearchResponse, WorkspaceFilter } from '../../src/shared/types'
import { FindInFiles } from '../../src/renderer/findInFiles'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

function response(searchId: number, path: string, preview: string): SearchResponse {
  return {
    searchId,
    totalMatches: 1,
    truncated: false,
    files: [{ path, matches: [{ line: 1, column: 1, length: 3, preview }], truncated: false }],
  }
}

describe('FindInFiles workspace context', () => {
  const baseline = openCount()
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"></div>'
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    while (openCount() > baseline) handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('cannot publish an old result after the workspace filter changes', async () => {
    const old = deferred<SearchResponse>()
    const cancelSearch = vi.fn()
    const searchFiles = vi.fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce((req: { searchId: number }) =>
        Promise.resolve(response(req.searchId, 'C:\\workspace\\fresh.txt', 'fresh result')))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { searchFiles, cancelSearch } as Partial<Api> as Api,
    })
    let filter: WorkspaceFilter = { showAll: false, excludePatterns: ['old/**'] }
    const find = new FindInFiles(document.getElementById('app')!, {
      root: () => 'C:\\workspace',
      filter: () => ({ showAll: filter.showAll, excludePatterns: [...filter.excludePatterns] }),
      workspaceExcludes: () => [...filter.excludePatterns],
      buffers: () => [],
      openMatch: vi.fn(),
      focusEditor: vi.fn(),
    })
    find.open()
    const input = document.querySelector<HTMLInputElement>('[aria-label="Find in Files"]')!
    input.value = 'needle'; input.dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(151)
    expect(searchFiles).toHaveBeenCalledTimes(1)

    filter = { showAll: true, excludePatterns: ['fresh/**'] }
    const oldId = searchFiles.mock.calls[0][0].searchId
    find.workspaceChanged()
    expect(cancelSearch).toHaveBeenCalledWith(oldId)
    expect(searchFiles).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(151)
    expect(searchFiles).toHaveBeenCalledTimes(2)
    expect(searchFiles.mock.calls[1][0].searchId).not.toBe(oldId)
    expect(cancelSearch.mock.invocationCallOrder[0]).toBeLessThan(searchFiles.mock.invocationCallOrder[1])
    expect(document.body.textContent).toContain('fresh result')

    old.resolve(response(oldId, 'C:\\workspace\\old.txt', 'old result'))
    await Promise.resolve(); await Promise.resolve()
    expect(document.body.textContent).toContain('fresh result')
    expect(document.body.textContent).not.toContain('old result')
  })
})
