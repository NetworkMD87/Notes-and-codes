import { describe, expect, it } from 'vitest'
import {
  extractSpellWords,
  isSpellEligible,
  maskSpellText,
  resolveSpellLocale
} from '../../src/shared/spellText'
import type { SpellWord } from '../../src/shared/spell'

const words = (...ranges: Array<[text: string, start: number, end: number]>): SpellWord[] =>
  ranges.map(([text, start, end]) => ({ text, start, end }))

function expectWords(text: string, languageId: string, expected: SpellWord[]): void {
  const actual = extractSpellWords(text, languageId)
  expect(actual).toEqual(expected)
  for (const word of actual) expect(text.slice(word.start, word.end)).toBe(word.text)

  const masked = maskSpellText(text, languageId)
  expect(masked).toHaveLength(text.length)
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '\r' || text[index] === '\n') expect(masked[index]).toBe(text[index])
  }
}

describe('spell locale and language eligibility', () => {
  it('enables only prose-oriented language ids', () => {
    expect(isSpellEligible('plaintext')).toBe(true)
    expect(isSpellEligible('markdown')).toBe(true)
    expect(isSpellEligible('typescript')).toBe(false)
  })

  it('resolves explicit and system dictionary preferences', () => {
    expect(resolveSpellLocale('en-US', 'en-GB')).toBe('en-US')
    expect(resolveSpellLocale('en-GB', 'en-US')).toBe('en-GB')
    expect(resolveSpellLocale('system', 'en-US')).toBe('en-US')
    expect(resolveSpellLocale('system', 'en-CA')).toBe('en-GB')
    expect(resolveSpellLocale('system', 'fr-FR')).toBe('en-GB')
  })
})

describe('offset-stable prose extraction', () => {
  it.each([
    {
      name: 'LF headings and paragraphs',
      text: '# Heading words\n\nParagraph words.',
      expected: words(['Heading', 2, 9], ['words', 10, 15], ['Paragraph', 17, 26], ['words', 27, 32])
    },
    {
      name: 'CRLF headings and paragraphs',
      text: '# Heading words\r\n\r\nParagraph words.',
      expected: words(['Heading', 2, 9], ['words', 10, 15], ['Paragraph', 19, 28], ['words', 29, 34])
    },
    {
      name: 'block quotes',
      text: '> Quoted prose',
      expected: words(['Quoted', 2, 8], ['prose', 9, 14])
    },
    {
      name: 'LF list text',
      text: '- List text\n1. Ordered prose',
      expected: words(['List', 2, 6], ['text', 7, 11], ['Ordered', 15, 22], ['prose', 23, 28])
    },
    {
      name: 'CRLF list text',
      text: '- List text\r\n1. Ordered prose',
      expected: words(['List', 2, 6], ['text', 7, 11], ['Ordered', 16, 23], ['prose', 24, 29])
    },
    {
      name: 'table cells',
      text: '| Cell words | Other prose |\n| --- | --- |',
      expected: words(['Cell', 2, 6], ['words', 7, 12], ['Other', 15, 20], ['prose', 21, 26])
    },
    {
      name: 'table cells with CRLF',
      text: '| Cell words | Other prose |\r\n| --- | --- |',
      expected: words(['Cell', 2, 6], ['words', 7, 12], ['Other', 15, 20], ['prose', 21, 26])
    },
    {
      name: 'link labels and image alt text',
      text: '[Visible label](technical-destination) and ![Image alt](image-target)',
      expected: words(['Visible', 1, 8], ['label', 9, 14], ['and', 39, 42], ['Image', 45, 50], ['alt', 51, 54])
    },
    {
      name: 'visible text inside an HTML span',
      text: 'Before <span class="x">human words</span> after',
      expected: words(['Before', 0, 6], ['human', 23, 28], ['words', 29, 34], ['after', 42, 47])
    },
    {
      name: 'visible text after a quoted greater-than attribute',
      text: '<span title="x > technical">human</span>',
      expected: words(['human', 28, 33])
    },
    {
      name: 'visible text after an LF multiline opening tag',
      text: '<span\n title="technical">\nhuman\n</span>',
      expected: words(['human', 26, 31])
    },
    {
      name: 'visible text inside a custom element',
      text: '<spell-checker>human</spell-checker>',
      expected: words(['human', 15, 20])
    }
  ])('extracts $name at original UTF-16 offsets', ({ text, expected }) => {
    expectWords(text, 'markdown', expected)
  })

  it.each([
    ['backtick fenced code with matching prose', 'mispeling\n```ts\nmispeling\n```\n', words(['mispeling', 0, 9])],
    ['backtick fenced code with CRLF', 'mispeling\r\n```ts\r\nmispeling\r\n```\r\n', words(['mispeling', 0, 9])],
    ['tilde fenced code', '~~~\nhidden words\n~~~\n', words()],
    ['tilde fenced code with CRLF', '~~~\r\nhidden words\r\n~~~\r\n', words()],
    ['LF indented code', '    hidden words\nvisible prose', words(['visible', 17, 24], ['prose', 25, 30])],
    ['CRLF indented code', '\thidden words\r\nvisible prose', words(['visible', 15, 22], ['prose', 23, 28])],
    ['CRLF four-space indented code', '    hidden words\r\nvisible prose', words(['visible', 18, 25], ['prose', 26, 31])],
    ['LF tab-indented code', '\thidden words\nvisible prose', words(['visible', 14, 21], ['prose', 22, 27])],
    ['multi-backtick inline code', '``hidden `code` words``', words()],
    ['LF multiline inline code', 'Visible ``hidden\ncode words`` trailing prose', words(['Visible', 0, 7], ['trailing', 30, 38], ['prose', 39, 44])],
    ['CRLF multiline inline code', 'Visible ``hidden\r\ncode words`` trailing prose', words(['Visible', 0, 7], ['trailing', 31, 39], ['prose', 40, 45])],
    ['reference definition', '[target]: https://example.com "Title"\n', words()],
    ['reference id suffix', '[Visible label][internal-id]', words(['Visible', 1, 8], ['label', 9, 14])],
    ['autolink', '<https://example.com/path>', words()],
    ['raw HTML tag syntax', '<span class="technical">', words()],
    ['YAML frontmatter', '---\ntitle: Hidden Words\n---\n', words()],
    ['YAML frontmatter with CRLF', '---\r\ntitle: Hidden Words\r\n---\r\n', words()],
    ['TOML frontmatter', '+++\ntitle = "Hidden Words"\n+++\n', words()],
    ['TOML frontmatter with CRLF', '+++\r\ntitle = "Hidden Words"\r\n+++\r\n', words()],
    ['URL', 'https://example.com/some-path?q=hidden', words()],
    ['email address', 'human.words+tag@example.co.uk', words()],
    ['Windows path', 'C:\\Users\\Human\\hidden-file.txt', words()],
    ['POSIX path', '/usr/local/share/hidden-file.txt', words()],
    ['Windows path with spaces', 'C:\\Program Files\\Human Notes\\file.txt', words()],
    ['quoted Windows path with spaces', '"C:\\Program Files\\Human Notes\\file.txt"', words()],
    ['quoted POSIX path with spaces', "'/Users/Human/My Notes/file.txt'", words()],
    ['HTML entity', '&technicalEntity;', words()]
  ])('excludes %s', (_name, text, expected) => {
    expectWords(text, 'markdown', expected)
  })

  it('retains apostrophes and hyphenated Unicode words while filtering abbreviations and numbers', () => {
    const text = "don't don’t state-of-the-art naïve Über CAFÉ NASA A 12345 !!!"
    expectWords(text, 'plaintext', words(
      ["don't", 0, 5],
      ['don’t', 6, 11],
      ['state-of-the-art', 12, 28],
      ['naïve', 29, 34],
      ['Über', 35, 39],
      ['A', 50, 51]
    ))
  })

  it('reports UTF-16 offsets after an astral character', () => {
    expectWords('😀 naïve', 'plaintext', words(['naïve', 3, 8]))
  })

  it('returns no words for ineligible languages', () => {
    expectWords('ordinary prose', 'typescript', words())
  })

  it('fails closed for unmatched fences and inline backticks', () => {
    expectWords('Visible\n```\nhidden remainder', 'markdown', words(['Visible', 0, 7]))
    expectWords('Visible `hidden remainder', 'markdown', words(['Visible', 0, 7]))
  })

  it('fails closed for an unterminated link destination without hiding its label', () => {
    expectWords(
      'Visible [label](technical-remainder',
      'markdown',
      words(['Visible', 0, 7], ['label', 9, 14])
    )
  })

  it('fails closed from an unmatched LF link label while retaining preceding prose', () => {
    expectWords('Visible\n[technical remainder', 'markdown', words(['Visible', 0, 7]))
  })

  it('fails closed from an unmatched CRLF image label while retaining preceding prose', () => {
    expectWords('Visible ![technical\r\nremainder', 'markdown', words(['Visible', 0, 7]))
  })

  it.each([
    ['link', 'Visible \\[mispeling remainder', words(['Visible', 0, 7], ['mispeling', 10, 19], ['remainder', 20, 29])],
    ['image', 'Visible \\![mispeling remainder', words(['Visible', 0, 7], ['mispeling', 11, 20], ['remainder', 21, 30])]
  ])('keeps an escaped Markdown %s opener as literal prose', (_name, text, expected) => {
    expectWords(text, 'markdown', expected)
  })

  it.each([
    [
      'absolute Windows',
      'Open C:\\tmp\\file.txt and fix mispeling',
      words(['Open', 0, 4], ['and', 21, 24], ['fix', 25, 28], ['mispeling', 29, 38])
    ],
    [
      'absolute POSIX',
      'Open /tmp/file.txt and fix mispeling',
      words(['Open', 0, 4], ['and', 19, 22], ['fix', 23, 26], ['mispeling', 27, 36])
    ],
    [
      'relative POSIX',
      'Open src/shared/spellText.ts and fix mispeling',
      words(['Open', 0, 4], ['and', 29, 32], ['fix', 33, 36], ['mispeling', 37, 46])
    ],
    [
      'relative Windows',
      'Open src\\shared\\spellText.ts and fix mispeling',
      words(['Open', 0, 4], ['and', 29, 32], ['fix', 33, 36], ['mispeling', 37, 46])
    ]
  ])('masks only an embedded %s path token', (_name, text, expected) => {
    expectWords(text, 'plaintext', expected)
  })

  it('masks two absolute Windows paths without consuming the prose between them', () => {
    expectWords(
      'Open C:\\tmp\\one.txt and fix mispeling at D:\\tmp\\two.txt',
      'plaintext',
      words(
        ['Open', 0, 4],
        ['and', 20, 23],
        ['fix', 24, 27],
        ['mispeling', 28, 37],
        ['at', 38, 40]
      )
    )
  })

  it.each([
    [
      'Windows',
      'Open C:\\tmp\\archive.tar.gz and fix mispeling',
      words(['Open', 0, 4], ['and', 27, 30], ['fix', 31, 34], ['mispeling', 35, 44])
    ],
    [
      'POSIX',
      'Open /tmp/archive.tar.gz and fix mispeling',
      words(['Open', 0, 4], ['and', 25, 28], ['fix', 29, 32], ['mispeling', 33, 42])
    ]
  ])('masks the complete multi-dot %s path without consuming following prose', (_name, text, expected) => {
    expectWords(text, 'plaintext', expected)
  })

  it('ends a compound Windows path before sentence prose and a later dotted token', () => {
    expectWords(
      'Open C:\\tmp\\archive.tar.gz. Then fix note.txt',
      'plaintext',
      words(
        ['Open', 0, 4],
        ['Then', 28, 32],
        ['fix', 33, 36],
        ['note', 37, 41],
        ['txt', 42, 45]
      )
    )
  })

  it('does not treat multiline comparison prose as raw HTML', () => {
    expectWords(
      'Use x < y\nmispeling > done',
      'markdown',
      words(['Use', 0, 3], ['x', 4, 5], ['y', 8, 9], ['mispeling', 10, 19], ['done', 22, 26])
    )
  })

  it.each([
    [
      'LF',
      'Use x <y\nmispeling > done',
      words(['Use', 0, 3], ['x', 4, 5], ['y', 7, 8], ['mispeling', 9, 18], ['done', 21, 25])
    ],
    [
      'CRLF',
      'Use x <y\r\nmispeling > done',
      words(['Use', 0, 3], ['x', 4, 5], ['y', 7, 8], ['mispeling', 10, 19], ['done', 22, 26])
    ]
  ])('does not treat %s comparison prose without a post-angle space as raw HTML', (_name, text, expected) => {
    expectWords(text, 'markdown', expected)
  })

  it('masks an HTML comment through its real terminator despite an earlier greater-than', () => {
    expectWords(
      'Before <!-- technical > mispeling --> after',
      'markdown',
      words(['Before', 0, 6], ['after', 38, 43])
    )
  })

  it('fails closed for an unterminated HTML comment', () => {
    expectWords('Visible <!-- technical > mispeling', 'markdown', words(['Visible', 0, 7]))
  })

  it('preserves nested link-label prose while excluding its relative destination', () => {
    expectWords(
      '[outer [inner] label](docs/hidden.md)',
      'markdown',
      words(['outer', 1, 6], ['inner', 8, 13], ['label', 15, 20])
    )
  })
})
