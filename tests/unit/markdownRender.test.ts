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
  it('renders an empty task item as a disabled checkbox', () => {
    const out = renderMarkdown('- [ ]')

    expect(out).toContain('<li class="task-list-item"><input type="checkbox" disabled="">')
  })
  it('does not borrow a following item task marker for an empty ordinary item', () => {
    const out = renderMarkdown('- \n- [ ] actual task')

    expect(out.match(/type="checkbox"/g)).toHaveLength(1)
    expect(out).toMatch(/<li>\s*<\/li>\n<li class="task-list-item">/)
  })
  it('assigns a nested task checkbox to its nested list item only', () => {
    const container = document.createElement('div')
    container.innerHTML = renderMarkdown('- \n  - [ ] child')
    const items = container.querySelectorAll('li')

    expect(items[0].classList.contains('task-list-item')).toBe(false)
    expect(items[1].classList.contains('task-list-item')).toBe(true)
    expect(items[1].querySelector('input[type="checkbox"]')?.hasAttribute('disabled')).toBe(true)
  })
})
