import type { ResolvedSpellLocale, SpellCheckLanguage, SpellWord } from './spell'

const WORD = /\p{L}+(?:['’]\p{L}+)*(?:-\p{L}+(?:['’]\p{L}+)*)*/gu
const KNOWN_MARKUP_TAGS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl',
  'dt', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe',
  'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'link', 'main', 'map', 'mark',
  'menu', 'meta', 'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option',
  'output', 'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'script', 'search', 'section', 'select', 'slot', 'small', 'source', 'span', 'strong',
  'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea',
  'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u', 'ul', 'var', 'video', 'wbr',
  'math', 'svg'
])

function maskRange(chars: string[], start: number, end: number): void {
  for (let index = start; index < end; index++) {
    if (chars[index] !== '\r' && chars[index] !== '\n') chars[index] = ' '
  }
}

function endOfLine(text: string, start: number): number {
  const newline = text.indexOf('\n', start)
  return newline === -1 ? text.length : newline
}

function maskFrontmatter(chars: string[]): void {
  const text = chars.join('')
  const opening = /^(---|\+\+\+)[ \t]*(?:\r?\n|$)/.exec(text)
  if (!opening) return

  const marker = opening[1].replaceAll('+', '\\+')
  const closing = new RegExp(`^${marker}[ \\t]*(?:\\r?\\n|$)`, 'gm')
  closing.lastIndex = opening[0].length
  const match = closing.exec(text)
  maskRange(chars, 0, match ? match.index + match[0].length : text.length)
}

function maskFencedCode(chars: string[]): void {
  const text = chars.join('')
  const opening = /^( {0,3})(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm
  let match: RegExpExecArray | null
  while ((match = opening.exec(text))) {
    const run = match[2]
    const closing = new RegExp(`^ {0,3}${run[0]}{${run.length},}[ \\t]*(?:\\r?\\n|$)`, 'gm')
    closing.lastIndex = match.index + match[0].length
    const close = closing.exec(text)
    const end = close ? close.index + close[0].length : text.length
    maskRange(chars, match.index, end)
    opening.lastIndex = end
  }
}

function maskIndentedCode(chars: string[]): void {
  const text = chars.join('')
  for (const match of text.matchAll(/^(?: {4,}|\t)[^\r\n]*(?:\r?\n|$)/gm)) {
    maskRange(chars, match.index, match.index + match[0].length)
  }
}

function maskReferenceDefinitions(chars: string[]): void {
  const text = chars.join('')
  for (const match of text.matchAll(/^[ \t]{0,3}\[[^\]\r\n]+\]:[^\r\n]*(?:\r?\n|$)/gm)) {
    maskRange(chars, match.index, match.index + match[0].length)
  }
}

function isFenceRun(text: string, match: RegExpExecArray): boolean {
  if (match[0].length < 3) return false
  const lineStart = text.lastIndexOf('\n', match.index - 1) + 1
  return /^ {0,3}$/.test(text.slice(lineStart, match.index))
}

function maskInlineCode(chars: string[]): void {
  const text = chars.join('')
  const runs = /`+/g
  let opening: RegExpExecArray | null
  while ((opening = runs.exec(text))) {
    if (isFenceRun(text, opening)) continue
    const lineEnd = endOfLine(text, opening.index)
    let closing: RegExpExecArray | null = null
    let candidate: RegExpExecArray | null
    while ((candidate = runs.exec(text))) {
      if (isFenceRun(text, candidate)) continue
      if (candidate[0].length === opening[0].length) {
        closing = candidate
        break
      }
    }

    const end = closing
      ? closing.index + closing[0].length
      : lineEnd
    maskRange(chars, opening.index, end)
    runs.lastIndex = end
  }
}

function findClosingBracket(text: string, start: number, closing: string): number {
  let depth = 0
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') {
      index++
    } else if (text[index] === '[') {
      depth++
    } else if (text[index] === closing) {
      if (depth === 0) return index
      depth--
    } else if (text[index] === '\r' || text[index] === '\n') {
      return -1
    }
  }
  return -1
}

function findClosingParenthesis(text: string, start: number): number {
  let depth = 1
  for (let index = start; index < text.length; index++) {
    if (text[index] === '\\') {
      index++
    } else if (text[index] === '(') {
      depth++
    } else if (text[index] === ')' && --depth === 0) {
      return index
    } else if (text[index] === '\r' || text[index] === '\n') {
      return -1
    }
  }
  return -1
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0
  while (index > 0 && text[--index] === '\\') backslashes++
  return backslashes % 2 === 1
}

function maskLinkTargets(chars: string[]): void {
  const text = chars.join('')
  for (let index = 0; index < text.length; index++) {
    if (isEscaped(text, index)) continue
    if (text[index] === '[' && text[index - 1] === '!') continue
    const constructStart = index
    const labelStart = text[index] === '!' && text[index + 1] === '['
      ? index + 1
      : text[index] === '[' ? index : -1
    if (labelStart === -1) continue

    const labelEnd = findClosingBracket(text, labelStart + 1, ']')
    if (labelEnd === -1) {
      maskRange(chars, constructStart, text.length)
      break
    }
    const suffixStart = labelEnd + 1
    if (text[suffixStart] === '(') {
      const suffixEnd = findClosingParenthesis(text, suffixStart + 1)
      const end = suffixEnd === -1 ? endOfLine(text, suffixStart) : suffixEnd + 1
      maskRange(chars, suffixStart, end)
      index = end - 1
    } else if (text[suffixStart] === '[') {
      const suffixEnd = findClosingBracket(text, suffixStart + 1, ']')
      const end = suffixEnd === -1 ? endOfLine(text, suffixStart) : suffixEnd + 1
      maskRange(chars, suffixStart, end)
      index = end - 1
    }
  }
}

function hasTagBefore(text: string, start: number, name: string): boolean {
  return new RegExp(`<${name}(?=[\\s/>])`, 'i').test(text.slice(0, start))
}

function hasClosingTagAfter(text: string, end: number, name: string): boolean {
  return new RegExp(`</${name}\\s*>`, 'i').test(text.slice(end + 1))
}

function isHtmlTagStart(text: string, start: number, end: number): boolean {
  let nameStart = start + 1
  if (text[nameStart] === '!' || text[nameStart] === '?') return true
  const isClosing = text[nameStart] === '/'
  if (isClosing) nameStart++

  const match = /^[A-Za-z][A-Za-z0-9-]*/.exec(text.slice(nameStart))
  if (!match) return false
  const boundary = text[nameStart + match[0].length]
  if (boundary !== undefined && !/[\s/>]/.test(boundary)) return false
  const name = match[0].toLowerCase()
  if (KNOWN_MARKUP_TAGS.has(name) || name.includes('-')) return true
  if (isClosing) return hasTagBefore(text, start, name)

  const attributes = text.slice(nameStart + match[0].length, end)
  return /(?:^|\s)[A-Za-z_:][A-Za-z0-9_.:-]*\s*=/.test(attributes) ||
    hasClosingTagAfter(text, end, name)
}

function findHtmlTagEnd(text: string, start: number): number {
  let quote: '"' | "'" | null = null
  for (let end = start + 1; end < text.length; end++) {
    const char = text[end]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return end
    }
  }
  return -1
}

function maskHtmlSyntax(chars: string[]): void {
  const text = chars.join('')
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '<') continue
    if (text.startsWith('<!--', start)) {
      const closing = text.indexOf('-->', start + 4)
      const end = closing === -1 ? text.length : closing + 3
      maskRange(chars, start, end)
      start = end - 1
      continue
    }
    const end = findHtmlTagEnd(text, start)
    if (end === -1 || !isHtmlTagStart(text, start, end)) continue
    maskRange(chars, start, end + 1)
    start = end
  }
}

function maskTechnicalTokens(chars: string[]): void {
  const patterns = [
    /\b(?:https?|ftp):\/\/[^\s<>]+/giu,
    /\bwww\.[^\s<>]+/giu,
    /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/gu,
    /(["'])(?:[A-Za-z]:\\|\\\\|\/)[^"'\r\n]+\1/g,
    /(?:[A-Za-z]:\\|\\\\)(?:[^\\:\r\n<>"|?*]+?\\)+?[^\\:\s\r\n<>"|?*]*?(?:\.[\p{L}\p{N}]+)+(?![\p{L}\p{N}])/gu,
    /(?:[A-Za-z]:\\|\\\\)[^\s<>"|?*\r\n]+/g,
    /(?:^|(?<=[\s(]))\/[^\s<>"'\r\n]+/gmu,
    /(?<![\p{L}\p{N}._-])(?:[\p{L}\p{N}._-]+[\\/])+[\p{L}\p{N}._-]+(?![\p{L}\p{N}._-])/gu,
    /&(?:#\d+|#x[\dA-Fa-f]+|[\p{L}][\p{L}\p{N}]+);/gu
  ]

  for (const pattern of patterns) {
    const text = chars.join('')
    for (const match of text.matchAll(pattern)) {
      maskRange(chars, match.index, match.index + match[0].length)
    }
  }
}

export function isSpellEligible(languageId: string): boolean {
  return languageId === 'plaintext' || languageId === 'markdown'
}

export function resolveSpellLocale(
  preference: SpellCheckLanguage,
  systemLocale: string
): ResolvedSpellLocale {
  if (preference !== 'system') return preference
  return systemLocale.toLowerCase() === 'en-us' ? 'en-US' : 'en-GB'
}

export function maskSpellText(text: string, languageId: string): string {
  const chars = text.split('')
  if (languageId === 'markdown') {
    maskFrontmatter(chars)
    maskFencedCode(chars)
    maskIndentedCode(chars)
    maskReferenceDefinitions(chars)
    maskInlineCode(chars)
    maskLinkTargets(chars)
    maskHtmlSyntax(chars)
  }
  maskTechnicalTokens(chars)
  return chars.join('')
}

export function extractSpellWords(text: string, languageId: string): SpellWord[] {
  if (!isSpellEligible(languageId)) return []

  const masked = maskSpellText(text, languageId)
  const result: SpellWord[] = []
  for (const match of masked.matchAll(WORD)) {
    const word = match[0]
    if (/\p{N}/u.test(word) || /^[\p{Lu}]{2,}$/u.test(word)) continue
    result.push({ text: text.slice(match.index, match.index + word.length), start: match.index, end: match.index + word.length })
  }
  return result
}
