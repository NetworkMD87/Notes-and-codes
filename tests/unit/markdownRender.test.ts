// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import MarkdownIt from 'markdown-it'
import { renderMarkdown, renderMarkdownFragment } from '../../src/renderer/markdownRender'

describe('renderMarkdown', () => {
  it('renders basic markdown to html', () => {
    expect(renderMarkdown('# Hi')).toContain('<h1>Hi</h1>')
    expect(renderMarkdown('**b**')).toContain('<strong>b</strong>')
  })
  it('strips script tags (sanitized)', () => {
    const out = renderMarkdown('hi <script>alert(1)</script>')
    expect(out).not.toContain('<script>')
  })
  it('keeps email and URL autolinks, line breaks, and unknown schemes intact', () => {
    const container = document.createElement('div')
    container.innerHTML = renderMarkdown('a@b.co\nhttps://example.com\na://a://\n**bold**')

    const links = [...container.querySelectorAll('a')]
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      'mailto:a@b.co', 'https://example.com',
    ])
    expect(links.every(link => link.getAttribute('rel') === 'noopener noreferrer')).toBe(true)
    expect(container.querySelectorAll('br')).toHaveLength(3)
    expect(container.textContent).toContain('a://a://')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
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

describe('renderMarkdownFragment', () => {
  it.each([
    '',
    '# Heading\n\nParagraph with **bold**, *emphasis*, `code`, café and 😀.\nNext line',
    '- [ ]\n- [x] Done\n  - [ ] Child\n- ordinary',
    '- \n  - [ ] Child\n\n1. first\n2. second',
    '| A | B |\n| --- | --- |\n| one | two |\n\n> Quote\n\n```html\n<script>literal</script>\n```',
    'a@b.co\nhttps://example.com\na://a://\n[unsafe](javascript:alert(1))',
    '<input onclick="alert(1)">\n<script>alert(1)</script>',
  ])('matches the existing sanitized export output for %j', source => {
    const panel = document.createElement('div')
    const fragment = renderMarkdownFragment(source)
    expect(fragment).toBeInstanceOf(DocumentFragment)
    panel.replaceChildren(fragment)
    expect(panel.innerHTML).toBe(renderMarkdown(source))
  })

  it('sanitizes parser output before returning live nodes', () => {
    // Exercise the sanitizer independently of markdown-it rejecting raw source HTML.
    const parser = vi.spyOn(MarkdownIt.prototype, 'render').mockReturnValue(
      '<script>alert(1)</script><img src="x" onerror="alert(1)">'
      + '<a href="javascript:alert(1)" onclick="alert(1)">unsafe</a>'
      + '<a href="https://example.com">safe</a><input type="checkbox" disabled checked>',
    )
    try {
      const fragment = renderMarkdownFragment('parser fixture')
      expect(fragment.querySelector('script, [onerror], [onclick]')).toBeNull()
      expect(fragment.querySelector('a')?.hasAttribute('href')).toBe(false)
      expect(fragment.querySelector('a[href]')?.getAttribute('rel')).toBe('noopener noreferrer')
      const checkbox = fragment.querySelector('input')!
      expect(checkbox.disabled).toBe(true)
      expect(checkbox.checked).toBe(true)
    } finally {
      parser.mockRestore()
    }
  })
})
