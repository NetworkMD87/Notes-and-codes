export type MarkdownAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'inline-code'
  | 'code-block'
  | 'quote'
  | 'bulleted-list'
  | 'numbered-list'
  | 'task-list'

export interface TextSelection { start: number; end: number }
export interface MarkdownEdit {
  range: TextSelection
  text: string
  selection: TextSelection
}

interface LineRange extends TextSelection { separator: string }

const lineRange = (source: string, selection: TextSelection): LineRange => {
  const start = source.lastIndexOf('\n', Math.max(0, selection.start - 1)) + 1
  const selectionEnd = selection.end > selection.start && source[selection.end - 1] === '\n'
    ? selection.end - 1
    : selection.end
  const nextBreak = source.indexOf('\n', selectionEnd)
  const rawEnd = nextBreak === -1 ? source.length : nextBreak
  const end = rawEnd > start && source[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd
  const separator = source.startsWith('\r\n', end)
    ? '\r\n'
    : source[end] === '\n'
      ? '\n'
      : source.includes('\r\n') ? '\r\n' : '\n'
  return { start, end, separator }
}

const translateCaret = (before: string, after: string, offset: number): number => {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++

  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  ) suffix++

  const beforeChangedEnd = before.length - suffix
  const afterChangedEnd = after.length - suffix
  if (offset >= beforeChangedEnd) return afterChangedEnd + offset - beforeChangedEnd
  if (offset <= prefix) return offset
  return prefix
}

const translateIndentCaret = (before: string, after: string, offset: number): number => {
  if (after.endsWith(before)) return offset + after.length - before.length
  if (before.endsWith(after)) return Math.max(0, offset - (before.length - after.length))
  return translateCaret(before, after, offset)
}

const editLines = (
  source: string,
  selection: TextSelection,
  transform: (lines: string[]) => string[],
  translate = translateCaret,
): MarkdownEdit => {
  const span = lineRange(source, selection)
  const range: TextSelection = { start: span.start, end: span.end }
  const lines = source.slice(range.start, range.end).split(/\r?\n/)
  const nextLines = transform(lines)
  const text = nextLines.join(span.separator)
  if (selection.start !== selection.end) {
    return { range, text, selection: { start: range.start, end: range.start + text.length } }
  }
  const offset = selection.start - range.start
  const before = lines[0]
  const after = nextLines[0]
  const caret = translate(before, after, offset)
  return { range, text, selection: { start: range.start + caret, end: range.start + caret } }
}

const inline = (
  source: string,
  selection: TextSelection,
  before: string,
  after: string,
  placeholder: string,
): MarkdownEdit => {
  const chosen = source.slice(selection.start, selection.end)
  if (chosen.startsWith(before) && chosen.endsWith(after) && chosen.length >= before.length + after.length) {
    const text = chosen.slice(before.length, chosen.length - after.length)
    return {
      range: selection,
      text,
      selection: { start: selection.start, end: selection.start + text.length },
    }
  }
  const inner = chosen || placeholder
  return {
    range: selection,
    text: before + inner + after,
    selection: { start: selection.start + before.length, end: selection.start + before.length + inner.length },
  }
}

const listMarker = {
  'bulleted-list': /^(\s*)[-+*]\s+/,
  'numbered-list': /^(\s*)\d+\.\s+/,
  'task-list': /^(\s*)-\s+\[[ xX]\]\s+/,
} as const

export function applyMarkdownAction(
  action: MarkdownAction,
  source: string,
  selection: TextSelection,
): MarkdownEdit {
  if (action === 'bold') return inline(source, selection, '**', '**', 'bold text')
  if (action === 'italic') return inline(source, selection, '_', '_', 'italic text')
  if (action === 'inline-code') return inline(source, selection, '`', '`', 'code')
  if (action === 'link') return inline(source, selection, '[', '](https://)', 'link text')

  if (action === 'code-block') {
    const span = lineRange(source, selection)
    const range: TextSelection = { start: span.start, end: span.end }
    const content = source.slice(range.start, range.end)
    const text = `\`\`\`\n${content}\n\`\`\``
    return {
      range,
      text,
      selection: { start: range.start + 4, end: range.start + 4 + content.length },
    }
  }

  if (action === 'heading' || action === 'quote') {
    const marker = action === 'heading' ? '# ' : '> '
    const markerPattern = action === 'heading' ? /^(\s*)#\s+/ : /^(\s*)>\s+/
    return editLines(source, selection, lines => {
      const remove = lines.every(line => markerPattern.test(line))
      return lines.map(line => remove ? line.replace(markerPattern, '$1') : marker + line)
    })
  }

  const markerPattern = listMarker[action]
  return editLines(source, selection, lines => {
    const remove = lines.every(line => markerPattern.test(line))
    let number = 1
    return lines.map(line => {
      if (remove) return line.replace(markerPattern, '$1')
      if (action === 'numbered-list') return `${number++}. ${line}`
      if (action === 'task-list') return `- [ ] ${line}`
      return `- ${line}`
    })
  })
}

export function smartListEnter(source: string, cursor: number): MarkdownEdit | null {
  const span = lineRange(source, { start: cursor, end: cursor })
  const range: TextSelection = { start: span.start, end: span.end }
  if (cursor < range.start || cursor > range.end) return null
  const line = source.slice(range.start, range.end)
  const task = /^(\s*)-\s+\[[ xX]\]\s*/.exec(line)
  const ordered = /^(\s*)(\d+)\.\s*/.exec(line)
  const bullet = /^(\s*)[-+*]\s*/.exec(line)
  const match = task ?? ordered ?? bullet
  if (!match) return null
  const indent = match[1]
  if (cursor - range.start < match[0].length) return null
  const content = line.slice(match[0].length)
  if (!content) return { range, text: indent, selection: { start: range.start + indent.length, end: range.start + indent.length } }
  const marker = task ? '- [ ] ' : ordered ? `${Number(ordered[2]) + 1}. ` : '- '
  const text = `${span.separator}${indent}${marker}`
  return { range: { start: cursor, end: cursor }, text, selection: { start: cursor + text.length, end: cursor + text.length } }
}

export function indentMarkdownList(
  source: string,
  selection: TextSelection,
  outdent: boolean,
): MarkdownEdit {
  return editLines(source, selection, lines => lines.map(line => {
    if (!/^(\s*)(?:[-+*]\s+|\d+\.\s+|-\s+\[[ xX]\]\s+)/.test(line)) return line
    return outdent ? line.replace(/^ {1,2}/, '') : `  ${line}`
  }), translateIndentCaret)
}
