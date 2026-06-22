import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') node.setAttribute('rel', 'noopener noreferrer')
})

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src))
}
