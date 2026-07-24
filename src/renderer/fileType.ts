import type { HighlightColour } from '../shared/types'

export interface FileBadge {
  label: string
  /** A shared-palette colour name, or null for a muted generic badge. */
  colour: HighlightColour | null
}

// Extension → palette colour NAME (must be a key of HL_HEX). Colour only from ACCENT_PALETTE.
const EXT_COLOUR: Record<string, HighlightColour> = {
  js: 'amber', mjs: 'amber', cjs: 'amber', jsx: 'amber',
  ts: 'blue', tsx: 'blue',
  json: 'yellow',
  md: 'slate', markdown: 'slate',
  css: 'sky',
  scss: 'pink', sass: 'pink', less: 'pink',
  html: 'orange', htm: 'orange', xml: 'orange',
  py: 'green',
  go: 'cyan',
  rs: 'orange',
  java: 'crimson', kt: 'crimson',
  c: 'indigo', h: 'indigo',
  cpp: 'violet', cc: 'violet', hpp: 'violet',
  rb: 'red',
  php: 'purple',
  sh: 'emerald', bash: 'emerald',
  yml: 'teal', yaml: 'teal', toml: 'teal', sql: 'teal',
  vue: 'emerald', svelte: 'emerald',
}

/** Badge (short label + palette colour) for a filename. Pure — no DOM. */
export function fileType(name: string): FileBadge {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) {
    // Extension-less (Makefile) or dotfile (.gitignore): a muted 3-char label.
    const base = name.startsWith('.') ? name.slice(1) : name
    return { label: base.slice(0, 3).toLowerCase(), colour: null }
  }
  const ext = name.slice(dot + 1).toLowerCase()
  return { label: ext.slice(0, 4), colour: EXT_COLOUR[ext] ?? null }
}

// Monaco language id → short label. For coloured types the label is ALSO an EXT_COLOUR key, so a
// language badge and the matching extension badge (sidebar) resolve to the same palette colour with no
// duplicated choices. plaintext→'txt' and csharp→'cs' have no EXT_COLOUR key on purpose → muted badge.
const LANG_LABEL: Record<string, string> = {
  typescript: 'ts', javascript: 'js', json: 'json', markdown: 'md',
  html: 'html', xml: 'xml', css: 'css', scss: 'scss', less: 'less',
  python: 'py', go: 'go', rust: 'rs', java: 'java', csharp: 'cs',
  cpp: 'cpp', c: 'c', ruby: 'rb', php: 'php', shell: 'sh',
  yaml: 'yml', sql: 'sql', plaintext: 'txt',
}

/** Badge for a buffer's Monaco language (works for unsaved buffers, which have no filename). Pure. */
export function langBadge(language: string): FileBadge {
  const label = LANG_LABEL[language] ?? language.slice(0, 4)
  return { label, colour: EXT_COLOUR[label] ?? null }
}
