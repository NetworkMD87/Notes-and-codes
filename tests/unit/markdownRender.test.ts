// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/renderer/markdownRender'

describe('renderMarkdown', () => {
  it('renders basic markdown to html', () => {
    expect(renderMarkdown('# Hi')).toContain('<h1>Hi</h1>')
    expect(renderMarkdown('**b**')).toContain('<strong>b</strong>')
  })
  it('strips script tags (sanitized)', () => {
    const out = renderMarkdown('hi <script>alert(1)</script>')
    expect(out).not.toContain('<script>')
  })
})
