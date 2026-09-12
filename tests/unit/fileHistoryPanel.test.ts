// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Api, FileVersion } from '../../src/shared/types'
import { FileHistoryPanel, type FileHistoryDeps } from '../../src/renderer/fileHistoryPanel'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const origin = { id: 'buffer-a', path: 'C:\\notes\\a.txt', title: 'A', content: 'live A', language: 'plaintext' }
const version: FileVersion = { ts: 1000, content: 'saved A', eol: 'LF', encoding: 'utf8' }

function setup() {
  let current: FileHistoryDeps['current'] = () => origin
  const diff = vi.fn()
  const restore = vi.fn()
  const getHistory = vi.fn()
  window.api = {
    listHistory: vi.fn(async () => [{ ts: version.ts }]),
    getHistory,
  } as Api
  const panel = new FileHistoryPanel(document.body, {
    current: () => current(),
    openDiff: diff,
    restore,
  }, vi.fn())
  return {
    panel, diff, restore, getHistory,
    setCurrent: (next: ReturnType<FileHistoryDeps['current']>) => { current = () => next },
  }
}

function button(label: 'Diff' | 'Restore'): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent === label)!
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('FileHistoryPanel delayed actions', () => {
  const baseline = openCount()

  afterEach(() => {
    while (openCount() > baseline) handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
    document.body.replaceChildren()
  })

  it('ignores Restore after the panel closes while the version read is pending', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Restore').click()
    document.querySelector<HTMLButtonElement>('.fh-close')!.click()
    read.resolve(version)
    await settle()

    expect(d.restore).not.toHaveBeenCalled()
  })

  it('ignores Restore when a different buffer becomes current while the version read is pending', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Restore').click()
    d.setCurrent({ ...origin, id: 'buffer-b', path: 'C:\\notes\\b.txt', title: 'B' })
    read.resolve(version)
    await settle()

    expect(d.restore).not.toHaveBeenCalled()
  })

  it('ignores Restore when the originating buffer path changes while the version read is pending', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Restore').click()
    d.setCurrent({ ...origin, path: 'C:\\notes\\renamed.txt' })
    read.resolve(version)
    await settle()

    expect(d.restore).not.toHaveBeenCalled()
  })

  it('ignores Diff when the panel context becomes stale while the version read is pending', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Diff').click()
    d.setCurrent({ ...origin, id: 'buffer-b', path: 'C:\\notes\\b.txt', title: 'B' })
    read.resolve(version)
    await settle()

    expect(d.diff).not.toHaveBeenCalled()
  })

  it('passes the original context to a valid Restore', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Restore').click()
    d.setCurrent({ ...origin, title: 'A renamed', content: 'new live A', language: 'markdown' })
    read.resolve(version)
    await settle()

    expect(d.restore).toHaveBeenCalledWith(version, origin)
  })

  it('passes the original context to a valid Diff', async () => {
    const d = setup()
    await d.panel.open()
    const read = deferred<FileVersion | null>()
    d.getHistory.mockReturnValueOnce(read.promise)

    button('Diff').click()
    d.setCurrent({ ...origin, title: 'A renamed', content: 'new live A', language: 'markdown' })
    read.resolve(version)
    await settle()

    expect(d.diff).toHaveBeenCalledWith(version, origin)
  })
})
