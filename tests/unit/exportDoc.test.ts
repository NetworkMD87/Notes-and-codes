// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { escapeHtml, wrapHtml, buildExportHtml, suggestExportName } from '../../src/renderer/exportDoc'

describe('escapeHtml', () => {
  it('escapes html-significant characters', () => {
    expect(escapeHtml('a<b>&"c')).toBe('a&lt;b&gt;&amp;&quot;c')
  })
  it('escapes single quotes (safe in future attribute contexts)', () => {
    expect(escapeHtml("O'Reilly")).toBe('O&#39;Reilly')
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
  it('renders a markdown buffer into the document body', () => {
    const out = buildExportHtml('# Hello', 'doc', 'markdown')
    expect(out).toContain('<h1>Hello</h1>')
    expect(out).toContain('<!doctype html>')
  })
  it('sanitizes script tags from a markdown source', () => {
    const out = buildExportHtml('hi <script>alert(1)</script>', 'doc', 'markdown')
    expect(out).not.toContain('<script>alert')
  })
  it('exports a non-markdown buffer verbatim in a code block, not as markdown', () => {
    // A .ts file must not be mangled: `#` comments stay literal (no <h1>), `<` is escaped,
    // indentation is preserved inside <pre><code>.
    const src = '# not a heading\nconst x = 1 < 2 // <b>'
    const out = buildExportHtml(src, 'code.ts', 'typescript')
    expect(out).toContain('<pre><code>')
    expect(out).toContain('# not a heading')      // literal, not a heading
    expect(out).not.toContain('<h1>')
    expect(out).toContain('1 &lt; 2 // &lt;b&gt;') // escaped
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
