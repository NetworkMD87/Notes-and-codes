// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'
import { PersonalDictionaryPanel } from '../../src/renderer/personalDictionaryPanel'
import type { SpellDictionaryResult } from '../../src/shared/types'

function escape(): void {
  handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
}

function harness(
  words: string[],
  remove: (word: string) => Promise<SpellDictionaryResult> = async word => ({
    ok: true,
    words: words.filter(current => current.toLocaleLowerCase('en') !== word.toLocaleLowerCase('en')),
  }),
) {
  const changed = vi.fn()
  const notify = vi.fn()
  const panel = new PersonalDictionaryPanel(document.body, {
    list: async () => [...words],
    remove,
    changed,
    notify,
  }, vi.fn())
  return { panel, changed, notify }
}

afterEach(() => {
  while (openCount() > 0) escape()
  document.body.replaceChildren()
})

describe('PersonalDictionaryPanel', () => {
  it('renders words in a case-insensitive sort order', async () => {
    const { panel } = harness(['zebra', 'Apple', 'banana'])

    await panel.open()

    expect([...document.querySelectorAll('.personal-word-text')].map(el => el.textContent))
      .toEqual(['Apple', 'banana', 'zebra'])
  })

  it('names word removal controls without changing sorted order', async () => {
    const { panel } = harness(['Zulu', 'alpha'])

    await panel.open()

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.personal-word button')]
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
      'Remove alpha from personal dictionary',
      'Remove Zulu from personal dictionary',
    ])
  })

  it('does not let a stale list generation repaint after close and reopen', async () => {
    const pending: Array<{ resolve: (words: string[]) => void }> = []
    const panel = new PersonalDictionaryPanel(document.body, {
      list: () => new Promise(resolve => pending.push({ resolve })),
      remove: async () => ({ ok: true, words: [] }),
      changed: vi.fn(),
      notify: vi.fn(),
    }, vi.fn())

    const firstOpen = panel.open()
    escape()
    const secondOpen = panel.open()
    pending[1].resolve(['current'])
    await secondOpen
    pending[0].resolve(['stale'])
    await firstOpen

    expect([...document.querySelectorAll('.personal-word-text')].map(el => el.textContent))
      .toEqual(['current'])
  })

  it('renders the empty state', async () => {
    const { panel } = harness([])

    await panel.open()

    expect(document.querySelector('.personal-dictionary-empty')?.textContent)
      .toBe('No personal words yet.')
  })

  it('replaces rows from the committed result and reports the change after removal', async () => {
    const remove = vi.fn(async () => ({ ok: true, words: ['zebra'] }))
    const { panel, changed } = harness(['Alpha', 'zebra'], remove)
    await panel.open()

    ;(document.querySelector('.personal-word button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('Alpha'))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith(['zebra']))

    expect([...document.querySelectorAll('.personal-word-text')].map(el => el.textContent))
      .toEqual(['zebra'])
  })

  it('preserves the row and emits one error when removal fails', async () => {
    const { panel, changed, notify } = harness(
      ['OpenAIish'],
      async () => ({ ok: false, words: ['OpenAIish'] }),
    )
    await panel.open()

    ;(document.querySelector('.personal-word button') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    expect(notify).toHaveBeenCalledWith('Could not remove that word from the personal dictionary.', 'error')
    expect(changed).not.toHaveBeenCalled()
    expect(document.querySelector('.personal-word-text')?.textContent).toBe('OpenAIish')
  })

  it('Escape closes the overlay and releases its registration', async () => {
    const start = openCount()
    const { panel } = harness(['word'])
    await panel.open()
    expect(openCount()).toBe(start + 1)

    escape()

    expect(document.querySelector('.personal-dictionary')?.classList.contains('hidden')).toBe(true)
    expect(openCount()).toBe(start)
  })
})
