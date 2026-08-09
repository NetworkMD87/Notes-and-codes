// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('split.js', () => ({
  default: vi.fn(() => ({ destroy: vi.fn() })),
}))

vi.mock('../../src/renderer/editorPane', () => ({
  EditorPane: class {
    layout(): void {}
  },
}))

import { SplitView } from '../../src/renderer/splitView'

describe('SplitView focus ownership', () => {
  beforeEach(() => document.body.replaceChildren())

  it('announces only real focus-owner changes between panes', () => {
    const paneA = document.createElement('div')
    const paneB = document.createElement('div')
    document.body.append(paneA, paneB)
    const view = new SplitView(paneA, paneB)
    const changes: Array<'A' | 'B'> = []

    view.onFocusChange(which => changes.push(which))
    paneA.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    paneB.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    paneB.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    paneA.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(changes).toEqual(['B', 'A'])
    expect(view.focusedPane()).toBe('A')
  })
})
