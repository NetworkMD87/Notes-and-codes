import { describe, expect, it } from 'vitest'
import {
  applyMarkdownAction,
  indentMarkdownList,
  smartListEnter,
  type TextSelection,
} from '../../src/renderer/markdownEditing'

const selection = (start: number, end = start): TextSelection => ({ start, end })

describe('Markdown editing transforms', () => {
  it('wraps selected inline text and keeps that text selected', () => {
    const edit = applyMarkdownAction('bold', 'write this', selection(6, 10))

    expect(edit).toEqual({
      range: selection(6, 10),
      text: '**this**',
      selection: selection(8, 12),
    })
  })

  it('removes matching inline Markdown delimiters on a repeated action', () => {
    const edit = applyMarkdownAction('inline-code', 'run `code` now', selection(4, 10))

    expect(edit).toEqual({
      range: selection(4, 10),
      text: 'code',
      selection: selection(4, 8),
    })
  })

  it('formats selected lines as sequential ordered items and removes them on repeat', () => {
    const numbered = applyMarkdownAction('numbered-list', 'first\nsecond', selection(0, 12))
    expect(numbered).toEqual({
      range: selection(0, 12),
      text: '1. first\n2. second',
      selection: selection(0, 18),
    })

    const unnumbered = applyMarkdownAction('numbered-list', numbered.text, selection(0, numbered.text.length))
    expect(unnumbered.text).toBe('first\nsecond')
  })

  it('formats and removes every selected bullet or task marker as one line edit', () => {
    expect(applyMarkdownAction('bulleted-list', 'one\ntwo', selection(0, 7)).text)
      .toBe('- one\n- two')
    expect(applyMarkdownAction('bulleted-list', '- one\n- two', selection(0, 11)).text)
      .toBe('one\ntwo')
    expect(applyMarkdownAction('task-list', 'one\ntwo', selection(0, 7)).text)
      .toBe('- [ ] one\n- [ ] two')
    expect(applyMarkdownAction('task-list', '- [ ] one\n- [ ] two', selection(0, 19)).text)
      .toBe('one\ntwo')
  })

  it('offers useful placeholders at an empty caret for links and fenced code', () => {
    expect(applyMarkdownAction('link', '', selection(0))).toEqual({
      range: selection(0),
      text: '[link text](https://)',
      selection: selection(1, 10),
    })
    expect(applyMarkdownAction('code-block', 'const x = 1', selection(0))).toEqual({
      range: selection(0, 11),
      text: '```\nconst x = 1\n```',
      selection: selection(4, 15),
    })
  })
})

describe('Markdown list decisions', () => {
  it('continues bullet, ordered, and task items with the expected next marker', () => {
    expect(smartListEnter('- one', 5)).toEqual({ range: selection(5), text: '\n- ', selection: selection(8) })
    expect(smartListEnter('8. one', 6)).toEqual({ range: selection(6), text: '\n9. ', selection: selection(10) })
    expect(smartListEnter('- [x] done', 10)).toEqual({ range: selection(10), text: '\n- [ ] ', selection: selection(17) })
  })

  it('exits an empty list item instead of adding another marker', () => {
    expect(smartListEnter('  - ', 4)).toEqual({ range: selection(0, 4), text: '  ', selection: selection(2) })
    expect(smartListEnter('3. ', 3)).toEqual({ range: selection(0, 3), text: '', selection: selection(0) })
  })

  it('indents and outdents only Markdown list lines in the selection', () => {
    expect(indentMarkdownList('one\n- two\n  3. three', selection(0, 20), false)).toEqual({
      range: selection(0, 20),
      text: 'one\n  - two\n    3. three',
      selection: selection(0, 24),
    })
    expect(indentMarkdownList('  - two\n    3. three', selection(0, 20), true).text)
      .toBe('- two\n  3. three')
  })
})
