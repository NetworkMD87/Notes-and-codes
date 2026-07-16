import { renderMarkdown } from './markdownRender'

export type ExportFormat = 'html' | 'pdf'

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

// Self-contained light "document" style. No CDN / web fonts so it works offline and in printToPDF.
const DOC_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; color: #1f2328;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .doc { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.6em 0 0.6em; font-weight: 600; }
  h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: .3em; }
  h3 { font-size: 1.25em; }
  p, ul, ol, blockquote, table, pre { margin: 0 0 1em; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: .9em; background: #eff1f3; padding: .15em .35em; border-radius: 4px; }
  pre { background: #f6f8fa; padding: 14px 16px; border-radius: 6px; overflow: auto; }
  pre code { background: none; padding: 0; font-size: .88em; }
  blockquote { border-left: 4px solid #d0d7de; color: #57606a; padding: 0 1em; margin-left: 0; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d0d7de; padding: 6px 13px; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  hr { border: 0; border-top: 1px solid #d0d7de; margin: 2em 0; }
  @page { margin: 18mm 16mm; }
`

export function wrapHtml(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${DOC_CSS}</style>
</head>
<body><main class="doc">${bodyHtml}</main></body>
</html>`
}

export function buildExportHtml(src: string, title: string, language: string): string {
  // Only a markdown buffer goes through the markdown pipeline. Any other language
  // (code, plain text) is exported verbatim in a code block — otherwise `#` comments
  // become headings, indentation collapses and `<` gets swallowed.
  const body = language === 'markdown'
    ? renderMarkdown(src)
    : `<pre><code>${escapeHtml(src)}</code></pre>`
  return wrapHtml(body, title)
}

export function suggestExportName(filePath: string | null, title: string, format: ExportFormat): string {
  const base = filePath ? filePath.replace(/^.*[\\/]/, '') : (title || 'untitled')
  const stem = base.replace(/\.[^.]+$/, '') || 'untitled'
  return `${stem}.${format}`
}
