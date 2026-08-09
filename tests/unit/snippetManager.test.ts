// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'
import { SnippetManager } from '../../src/renderer/snippetManager'
import type { Snippet } from '../../src/shared/types'

afterEach(() => {
  while (openCount() > 0) handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
  document.body.replaceChildren()
})

describe('SnippetManager', () => {
  it('refreshes all snippet control names after rename without moving focus', () => {
    const snippets: Snippet[] = [{ id: 'one', name: 'Before', body: 'body' }]
    const manager = new SnippetManager(document.body, {
      list: () => snippets,
      add: vi.fn(),
      rename: (_id, name) => { snippets[0].name = name },
      updateBody: vi.fn(),
      remove: vi.fn(),
      persist: vi.fn(),
    }, vi.fn())

    manager.open()
    const name = document.querySelector<HTMLInputElement>('.snip-mgr-name')!
    const body = document.querySelector<HTMLTextAreaElement>('.snip-mgr-body')!
    const remove = document.querySelector<HTMLButtonElement>('.snip-mgr-row button')!
    name.focus()
    name.value = 'After'
    name.dispatchEvent(new Event('change'))

    expect(name.getAttribute('aria-label')).toBe('Snippet name: After')
    expect(body.getAttribute('aria-label')).toBe('Snippet body: After')
    expect(remove.getAttribute('aria-label')).toBe('Delete snippet After')
    expect(document.activeElement).toBe(name)
  })
})
