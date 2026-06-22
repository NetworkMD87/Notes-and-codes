import { renderMarkdown } from './markdownRender'

export class MarkdownPreview {
  private visible = false
  constructor(private panel: HTMLElement, private onLayout: () => void) {
    this.panel.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a')
      if (a) e.preventDefault()
    })
  }

  isVisible(): boolean { return this.visible }

  toggle(): boolean {
    this.visible = !this.visible
    this.panel.classList.toggle('hidden', !this.visible)
    this.onLayout()
    return this.visible
  }

  update(md: string): void {
    if (!this.visible) return
    try { this.panel.innerHTML = renderMarkdown(md) }
    catch { this.panel.textContent = 'Preview failed to render.' }
  }
}
