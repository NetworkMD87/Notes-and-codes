// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { escapeHtml, wrapHtml, buildExportHtml, suggestExportName } from '../../src/renderer/exportDoc'

describe('escapeHtml', () => {
  it('escapes html-significant characters', () => {
    expect(escapeHtml('a<b>&"c')).toBe('a&lt;b&gt;&amp;&quot;c')
  })
})

describe('wrapHtml', () => {
  it('produces a standalone document with title, css and body', () => {
    const out = wrapHtml('<p>hi</p>', 'My Note')
    expect(out).toContain('<!doctype html>')
    expect(out).toContain('<title>My Note</title>')
    expect(out).toContain('max-width: 760px')
    expect(out).toContain('<p>hi</p>')
  })
  it('escapes the title', () => {
    expect(wrapHtml('', 'a & b <x>')).toContain('<title>a &amp; b &lt;x&gt;</title>')
  })
})

describe('buildExportHtml', () => {
  it('renders markdown into the document body', () => {
    const out = buildExportHtml('# Hello', 'doc')
    expect(out).toContain('<h1>Hello</h1>')
    expect(out).toContain('<!doctype html>')
  })
  it('sanitizes script tags from the source', () => {
    const out = buildExportHtml('hi <script>alert(1)</script>', 'doc')
    expect(out).not.toContain('<script>alert')
  })
})

describe('suggestExportName', () => {
  it('uses the file basename with a new extension', () => {
    expect(suggestExportName('C:\\notes\\todo.md', 'todo.md', 'html')).toBe('todo.html')
    expect(suggestExportName('/home/u/readme.txt', 'readme.txt', 'pdf')).toBe('readme.pdf')
  })
  it('falls back to the title for unsaved buffers', () => {
    expect(suggestExportName(null, 'Untitled-1', 'pdf')).toBe('Untitled-1.pdf')
  })
  it('falls back to untitled when there is no name', () => {
    expect(suggestExportName(null, '', 'html')).toBe('untitled.html')
  })
})
