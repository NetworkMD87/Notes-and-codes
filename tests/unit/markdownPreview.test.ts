// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from '../../src/renderer/markdownPreview'

describe('MarkdownPreview', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('renders immediately when shown and debounces edits to the newest content', async () => {
    vi.useFakeTimers()
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => `<p>${markdown}</p>`)
    const preview = new MarkdownPreview(panel, { render })

    expect(preview.setActive(true, 'a', 'first')).toBe(true)
    expect(preview.isActive()).toBe(true)
    expect(render).toHaveBeenLastCalledWith('first')

    preview.update('a', 'middle')
    preview.update('a', 'newest')
    await vi.advanceTimersByTimeAsync(149)
    expect(render).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(render).toHaveBeenLastCalledWith('newest')
    expect(panel.innerHTML).toBe('<p>newest</p>')
  })

  it('cancels pending work on hide, buffer switch, and dispose', async () => {
    vi.useFakeTimers()
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => markdown)
    const preview = new MarkdownPreview(panel, { render })

    preview.setActive(true, 'a', 'a0')
    preview.update('a', 'stale-a')
    preview.switchBuffer('b', 'fresh-b')
    expect(render).toHaveBeenLastCalledWith('fresh-b')
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('stale-a')

    preview.update('b', 'hidden-work')
    expect(preview.setActive(false, 'b', 'hidden-work')).toBe(true)
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('hidden-work')

    expect(preview.setActive(true, 'b', 'visible-again')).toBe(true)
    preview.update('b', 'disposed-work')
    preview.dispose()
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('disposed-work')
  })

  it('invalidates a cleared callback when switching away and back to its buffer', () => {
    const callbacks: Array<() => void> = []
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => markdown)
    const preview = new MarkdownPreview(panel, {
      render,
      setTimer: (callback) => {
        callbacks.push(callback)
        return callbacks.length as ReturnType<typeof setTimeout>
      },
      // Model a callback that has already entered the host queue and cannot be retracted.
      clearTimer: vi.fn(),
    })

    preview.setActive(true, 'a', 'a0')
    preview.update('a', 'stale-a')
    preview.switchBuffer('b', 'fresh-b')
    preview.switchBuffer('a', 'fresh-a')
    callbacks[0]()

    expect(panel.textContent).toBe('fresh-a')
    expect(render).not.toHaveBeenCalledWith('stale-a')
  })

  it('rejects an old same-buffer callback without clearing the newest timer', () => {
    const callbacks: Array<() => void> = []
    const panel = document.createElement('div')
    const render = vi.fn((markdown: string) => markdown)
    const preview = new MarkdownPreview(panel, {
      render,
      setTimer: (callback) => {
        callbacks.push(callback)
        return callbacks.length as ReturnType<typeof setTimeout>
      },
      // Model callbacks already queued by the host, which clearTimeout cannot retract.
      clearTimer: vi.fn(),
    })

    preview.setActive(true, 'a', 'a0')
    preview.update('a', 'old-edit')
    preview.update('a', 'newest-edit')
    callbacks[0]()
    callbacks[1]()

    expect(render.mock.calls.map(([markdown]) => markdown)).toEqual(['a0', 'newest-edit'])
    expect(panel.textContent).toBe('newest-edit')
  })

  it('keeps the newest timer cancellable after an old callback runs', () => {
    const callbacks: Array<() => void> = []
    const clearTimer = vi.fn()
    const preview = new MarkdownPreview(document.createElement('div'), {
      render: markdown => markdown,
      setTimer: (callback) => {
        callbacks.push(callback)
        return callbacks.length as ReturnType<typeof setTimeout>
      },
      clearTimer,
    })

    preview.setActive(true, 'a', 'a0')
    preview.update('a', 'old-edit')
    preview.update('a', 'newest-edit')
    callbacks[0]()
    preview.dispose()

    expect(clearTimer.mock.calls.map(([timer]) => timer)).toEqual([1, 2])
  })

  it('disposes its timer and click listener once and cannot render again', () => {
    const callbacks: Array<() => void> = []
    const panel = document.createElement('div')
    const clearTimer = vi.fn()
    const render = vi.fn((markdown: string) => markdown)
    const preview = new MarkdownPreview(panel, {
      render,
      setTimer: (callback) => {
        callbacks.push(callback)
        return callbacks.length as ReturnType<typeof setTimeout>
      },
      clearTimer,
    })

    preview.setActive(true, 'a', 'shown')
    const anchor = document.createElement('a')
    panel.appendChild(anchor)
    const beforeDispose = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(beforeDispose)
    expect(beforeDispose.defaultPrevented).toBe(true)
    preview.update('a', 'queued')

    preview.dispose()
    preview.dispose()
    callbacks[0]()
    const afterDispose = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(afterDispose)

    expect(clearTimer).toHaveBeenCalledTimes(1)
    expect(afterDispose.defaultPrevented).toBe(false)
    expect(preview.setActive(true, 'a', 'after-dispose')).toBe(false)
    expect(render.mock.calls.map(([markdown]) => markdown)).toEqual(['shown'])
  })
})
