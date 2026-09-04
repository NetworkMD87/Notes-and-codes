// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Split from 'split.js'
import { DEFAULT_SETTINGS } from '../../src/shared/types'
import { MarkdownPreviewLayout } from '../../src/renderer/markdownPreviewLayout'

function harness() {
  document.body.innerHTML = '<div id="root"><div id="editor"></div><div id="preview"></div></div>'
  const root = document.getElementById('root')!
  const editor = document.getElementById('editor')!
  const preview = document.getElementById('preview')!
  Object.defineProperty(root, 'clientWidth', { configurable: true, value: 1000 })
  let sizes = [50, 50]
  let options!: Split.Options
  const instance: Split.Instance = {
    setSizes: vi.fn(next => { sizes = [...next] }),
    getSizes: vi.fn(() => [...sizes]),
    collapse: vi.fn(),
    destroy: vi.fn(),
  }
  const createSplit = vi.fn((elements: Array<string | HTMLElement>, next?: Split.Options) => {
    options = next!
    return instance
  }) as typeof Split
  const persist = vi.fn(async () => {})
  const focusEditor = vi.fn()
  const layoutEditors = vi.fn()
  const warn = vi.fn()
  let resize = (): void => undefined
  const resizeObserver = { observe: vi.fn(), disconnect: vi.fn() }
  const createResizeObserver = vi.fn((callback: () => void) => {
    resize = callback
    return resizeObserver
  })
  const deps = {
    createSplit, persist, focusEditor, layoutEditors, warn, createResizeObserver,
  }
  const layout = new MarkdownPreviewLayout(root, editor, preview, deps)
  return {
    layout, root, editor, preview, createSplit, instance, persist, focusEditor,
    layoutEditors, warn, options: () => options, resize: () => resize(),
    createResizeObserver, resizeObserver,
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('MarkdownPreviewLayout', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('keeps the A/B editor group intact inside the outer side-by-side split', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    expect(h.layout.selectMode('side-by-side')).toBe(true)
    expect(h.createSplit).toHaveBeenCalledWith(
      [h.editor, h.preview],
      expect.objectContaining({ sizes: [50, 50], minSize: [160, 160], gutterSize: 6 }),
    )
    expect(h.root.dataset.markdownPreviewMode).toBe('side-by-side')
  })

  it('temporarily shows the editor for non-Markdown without overwriting the preference', () => {
    const h = harness()
    h.layout.restore({ ...DEFAULT_SETTINGS, markdownPreviewMode: 'focus', markdownPreviewLastVisibleMode: 'focus' }, true)
    h.layout.setBufferIsMarkdown(false)
    expect(h.layout.effectiveMode()).toBe('off')
    expect(h.layout.state().requestedMode).toBe('focus')
    h.layout.setBufferIsMarkdown(true)
    expect(h.layout.effectiveMode()).toBe('focus')
  })

  it('toggles Off back to the last visible mode', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('focus')
    h.layout.toggle()
    expect(h.layout.state().requestedMode).toBe('off')
    h.layout.toggle()
    expect(h.layout.state().requestedMode).toBe('focus')
  })

  it('uses session defaults on restore when remembering is disabled', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      rememberMarkdownPreviewMode: false,
      markdownPreviewMode: 'focus',
      markdownPreviewLastVisibleMode: 'focus',
      markdownPreviewWidthPercent: 72,
    }, true)
    expect(h.layout.state()).toEqual({
      remember: false,
      requestedMode: 'off',
      lastVisibleMode: 'side-by-side',
      previewWidthPercent: 50,
    })
  })

  it('does not reapply or persist an already selected mode', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('side-by-side')
    const layouts = h.layoutEditors.mock.calls.length
    expect(h.layout.selectMode('side-by-side')).toBe(true)
    expect(h.layoutEditors).toHaveBeenCalledTimes(layouts)
    expect(h.persist).toHaveBeenCalledTimes(1)
  })

  it('returns Focus to the preview on a Markdown buffer activation without reapplying layout', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      markdownPreviewMode: 'focus',
      markdownPreviewLastVisibleMode: 'focus',
    }, true)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    h.layoutEditors.mockClear()
    h.persist.mockClear()

    const activation = (h.layout as unknown as {
      activateBuffer?: (isMarkdown: boolean) => void
    }).activateBuffer
    expect(activation).toBeTypeOf('function')
    activation!.call(h.layout, true)

    expect(document.activeElement).toBe(h.preview)
    expect(h.layoutEditors).not.toHaveBeenCalled()
    expect(h.persist).not.toHaveBeenCalled()
  })

  it('persists changes only while Remember is on, including its enabled baseline', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.setRemember(false)
    expect(h.persist).toHaveBeenLastCalledWith(expect.objectContaining({ remember: false }))
    const callsAfterDisable = h.persist.mock.calls.length
    h.layout.selectMode('focus')
    expect(h.persist).toHaveBeenCalledTimes(callsAfterDisable)
    h.layout.setRemember(true)
    expect(h.persist).toHaveBeenLastCalledWith({
      remember: true,
      requestedMode: 'focus',
      lastVisibleMode: 'focus',
      previewWidthPercent: 50,
    })
  })

  it('enters preview focus and returns focus to the editor when leaving it', async () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    await flush()
    h.focusEditor.mockClear()
    h.layout.selectMode('focus')
    expect(document.activeElement).toBe(h.preview)
    h.layout.selectMode('off')
    await flush()
    expect(h.focusEditor).toHaveBeenCalledTimes(1)
  })

  it('clamps a persisted width to the 20–80 percent range', () => {
    const h = harness()
    h.layout.restore({ ...DEFAULT_SETTINGS, markdownPreviewMode: 'side-by-side', markdownPreviewWidthPercent: 95 }, true)
    expect(h.createSplit).toHaveBeenCalledWith([h.editor, h.preview], expect.objectContaining({ sizes: [20, 80] }))
    expect(h.layout.state().previewWidthPercent).toBe(80)
  })

  it('clamps runtime resizing to 160 physical pixels', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('side-by-side')
    Object.defineProperty(h.root, 'clientWidth', { configurable: true, value: 400 })
    h.options().onDragEnd!([95, 5])
    expect(h.instance.setSizes).toHaveBeenLastCalledWith([59.390862944162436, 40.609137055837564])
    expect(h.layout.state().previewWidthPercent).toBeCloseTo(40.609137055837564)
  })

  it('observes workspace resizes, reclamps the live split, and refreshes ARIA without persisting', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      markdownPreviewMode: 'side-by-side',
      markdownPreviewWidthPercent: 80,
    }, true)
    const gutter = h.options().gutter!('horizontal', 6)

    expect(h.createResizeObserver).toHaveBeenCalledOnce()
    expect(h.resizeObserver.observe).toHaveBeenCalledWith(h.root)
    Object.defineProperty(h.root, 'clientWidth', { configurable: true, value: 400 })
    h.resize()

    expect(h.instance.setSizes).toHaveBeenLastCalledWith([
      40.609137055837564,
      59.390862944162436,
    ])
    expect(h.layout.state().previewWidthPercent).toBeCloseTo(59.390862944162436)
    expect(gutter.getAttribute('aria-valuemin')).toBe('41')
    expect(gutter.getAttribute('aria-valuemax')).toBe('59')
    expect(gutter.getAttribute('aria-valuenow')).toBe('59')
    expect(h.persist).not.toHaveBeenCalled()

    h.layout.dispose()
    expect(h.resizeObserver.disconnect).toHaveBeenCalledOnce()
    const resizeCalls = h.instance.setSizes.mock.calls.length
    h.resize()
    expect(h.instance.setSizes).toHaveBeenCalledTimes(resizeCalls)
  })

  it('rounds the accepted preview width only in the persisted snapshot', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      markdownPreviewMode: 'side-by-side',
    }, true)

    h.options().onDragEnd!([36.4, 63.6])

    expect(h.instance.setSizes).toHaveBeenLastCalledWith([36.4, 63.6])
    expect(h.layout.state().previewWidthPercent).toBe(63.6)
    expect(h.persist).toHaveBeenLastCalledWith(expect.objectContaining({
      previewWidthPercent: 64,
    }))
  })

  it('supports keyboard resize, Home and End with ARIA values', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('side-by-side')
    const gutter = h.options().gutter!('horizontal', 6)
    gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(h.instance.setSizes).toHaveBeenLastCalledWith([45, 55])
    gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(h.instance.setSizes).toHaveBeenLastCalledWith([50, 50])
    gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(h.instance.setSizes).toHaveBeenLastCalledWith([80, 20])
    gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
    expect(h.instance.setSizes).toHaveBeenLastCalledWith([20, 80])
    expect(gutter.getAttribute('role')).toBe('separator')
    expect(gutter.getAttribute('aria-valuemin')).toBe('20')
    expect(gutter.getAttribute('aria-valuemax')).toBe('80')
    expect(gutter.getAttribute('aria-valuenow')).toBe('80')
    expect(gutter.getAttribute('aria-valuetext')).toBe('80% preview')
  })

  it('warns if saving a preference is rejected', async () => {
    const h = harness()
    h.persist.mockRejectedValueOnce(new Error('disk unavailable'))
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('focus')
    await flush()
    expect(h.warn).toHaveBeenCalledWith('Could not save the Markdown preview preference.')
  })

  it('returns false without changes when a Markdown preview is unavailable', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, false)
    expect(h.layout.selectMode('focus')).toBe(false)
    expect(h.layout.toggle()).toBe(false)
    expect(h.layout.state().requestedMode).toBe('off')
  })

  it('allows an untitled plaintext buffer to request preview without rendering it before conversion', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      markdownPreviewMode: 'focus',
      markdownPreviewLastVisibleMode: 'focus',
    }, false, true)

    expect(h.layout.isAvailable()).toBe(true)
    expect(h.layout.effectiveMode()).toBe('off')
    expect(h.layout.selectMode('focus')).toBe(true)
    expect(h.layout.effectiveMode()).toBe('off')
  })

  it('uses the remembered visible mode when toggled from an untitled plaintext buffer', () => {
    const h = harness()
    h.layout.restore({
      ...DEFAULT_SETTINGS,
      markdownPreviewMode: 'focus',
      markdownPreviewLastVisibleMode: 'focus',
    }, false, true)

    expect(h.layout.toggle()).toBe(true)
    expect(h.layout.state().requestedMode).toBe('focus')
  })

  it('destroys the outer split and gutter listener exactly once', () => {
    const h = harness()
    h.layout.restore(DEFAULT_SETTINGS, true)
    h.layout.selectMode('side-by-side')
    const gutter = h.options().gutter!('horizontal', 6)
    h.editor.style.flexBasis = '50%'
    h.preview.style.flexBasis = '50%'
    h.layout.dispose()
    h.layout.dispose()
    expect(h.instance.destroy).toHaveBeenCalledTimes(1)
    expect(h.editor.style.flexBasis).toBe('')
    expect(h.preview.style.flexBasis).toBe('')
    gutter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(h.instance.setSizes).not.toHaveBeenCalled()
  })
})
