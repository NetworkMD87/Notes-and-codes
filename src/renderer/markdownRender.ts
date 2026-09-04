import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') node.setAttribute('rel', 'noopener noreferrer')
})

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

md.core.ruler.after('inline', 'task-list-checkboxes', (state) => {
  for (let index = 0; index < state.tokens.length; index++) {
    const item = state.tokens[index]
    if (item.type !== 'list_item_open') continue
    let inline: typeof item | undefined
    for (let child = index + 1; child < state.tokens.length && state.tokens[child].type !== 'list_item_close'; child++) {
      if (state.tokens[child].type === 'inline' && state.tokens[child].level === item.level + 2) {
        inline = state.tokens[child]
        break
      }
    }
    const first = inline?.children?.[0]
    const match = first?.type === 'text' ? /^\[([ xX])\](?:\s+|$)/.exec(first.content) : null
    if (!inline || !first || !match) continue
    item.attrJoin('class', 'task-list-item')
    first.content = first.content.slice(match[0].length)
    inline.children!.unshift(new state.Token(
      'html_inline', '', 0,
    ))
    inline.children![0].content = `<input type="checkbox" disabled${match[1].toLowerCase() === 'x' ? ' checked' : ''}> `
  }
})

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src))
}
