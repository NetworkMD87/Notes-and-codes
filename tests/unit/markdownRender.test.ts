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
  it('renders Markdown task markers as disabled checkboxes without accepting source HTML', () => {
    const out = renderMarkdown('- [ ] pending\n- [x] finished\n<input onclick="alert(1)">')

    expect(out).toContain('<input type="checkbox" disabled=""')
    expect(out).toContain('checked=""')
    expect(out).toContain('&lt;input')
    expect(out).not.toContain('<input onclick=')
  })
  it('does not borrow a following item task marker for an empty ordinary item', () => {
    const out = renderMarkdown('- \n- [ ] actual task')

    expect(out.match(/type="checkbox"/g)).toHaveLength(1)
    expect(out).toMatch(/<li>\s*<\/li>\n<li class="task-list-item">/)
  })
})
