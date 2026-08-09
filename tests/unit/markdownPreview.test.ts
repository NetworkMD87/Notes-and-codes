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
    const onLayout = vi.fn()
    const preview = new MarkdownPreview(panel, { onLayout, render })

    expect(preview.toggle('a', 'first')).toBe(true)
    expect(render).toHaveBeenLastCalledWith('first')
    expect(onLayout).toHaveBeenCalledTimes(1)

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
    const preview = new MarkdownPreview(panel, { onLayout: vi.fn(), render })

    preview.toggle('a', 'a0')
    preview.update('a', 'stale-a')
    preview.switchBuffer('b', 'fresh-b')
    expect(render).toHaveBeenLastCalledWith('fresh-b')
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('stale-a')

    preview.update('b', 'hidden-work')
    expect(preview.toggle('b', 'hidden-work')).toBe(false)
    await vi.advanceTimersByTimeAsync(150)
    expect(render).not.toHaveBeenCalledWith('hidden-work')

    expect(preview.toggle('b', 'visible-again')).toBe(true)
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
      onLayout: vi.fn(),
      render,
      setTimer: (callback) => {
        callbacks.push(callback)
        return callbacks.length as ReturnType<typeof setTimeout>
      },
      // Model a callback that has already entered the host queue and cannot be retracted.
      clearTimer: vi.fn(),
    })

    preview.toggle('a', 'a0')
    preview.update('a', 'stale-a')
    preview.switchBuffer('b', 'fresh-b')
    preview.switchBuffer('a', 'fresh-a')
    callbacks[0]()

    expect(panel.textContent).toBe('fresh-a')
    expect(render).not.toHaveBeenCalledWith('stale-a')
  })
})
