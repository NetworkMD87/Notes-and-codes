// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeContextMenu } from '../../src/renderer/contextMenu'
import { Toolbar, type ToolbarHandlers } from '../../src/renderer/toolbar'

const createHandlers = (): ToolbarHandlers => ({
  open: vi.fn(),
  save: vi.fn(),
  openHistory: vi.fn(),
  toggleSplit: vi.fn(),
  togglePreview: vi.fn(),
  setPreviewMode: vi.fn(),
  togglePin: vi.fn(),
  startDiff: vi.fn(),
  pasteFromHistory: vi.fn(),
  toggleHighlighter: vi.fn(),
  pickHighlightColour: vi.fn(),
  clearHighlights: vi.fn(),
  openSettings: vi.fn(),
})

describe('Toolbar Markdown preview split control', () => {
  afterEach(() => {
    closeContextMenu()
    document.body.replaceChildren()
  })

  it('toggles preview and selects each explicit preview mode', () => {
    const handlers = createHandlers()
    const toolbar = new Toolbar(document.body, handlers)
    const preview = document.querySelector<HTMLButtonElement>('[data-toolbar="markdown-preview-toggle"]')!
    const chooser = document.querySelector<HTMLButtonElement>('[aria-label="Choose Markdown preview mode"]')!

    expect(preview).toBeDefined()
    expect(chooser.getAttribute('aria-haspopup')).toBe('menu')
    preview.click()
    expect(handlers.togglePreview).toHaveBeenCalledOnce()

    toolbar.syncPreview({ available: true, mode: 'focus', lastVisibleMode: 'focus' })
    expect(preview.classList.contains('tb-active')).toBe(true)
    expect(preview.getAttribute('aria-pressed')).toBe('true')
    expect(preview.title).toBe('Turn Markdown preview off')

    chooser.click()
    const focus = document.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')!
    expect(focus.textContent).toContain('Focus')

    document.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!.click()
    expect(handlers.setPreviewMode).toHaveBeenCalledWith('side-by-side')
    chooser.click()
    document.querySelector<HTMLButtonElement>('[role="menuitemradio"]:last-child')!.click()
    expect(handlers.setPreviewMode).toHaveBeenCalledWith('off')

    toolbar.syncPreview({ available: false, mode: 'off', lastVisibleMode: 'focus' })
    expect(preview.disabled).toBe(true)
    expect(chooser.disabled).toBe(true)
    expect(preview.title).toBe('Markdown preview is available for Markdown files')
  })
})
