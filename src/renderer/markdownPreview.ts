import { renderMarkdown } from './markdownRender'

export interface MarkdownPreviewDeps {
  onLayout: () => void
  render?: (markdown: string) => string
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export class MarkdownPreview {
  private visible = false
  private bufferId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private readonly render: (markdown: string) => string
  private readonly setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void

  constructor(private panel: HTMLElement, private deps: MarkdownPreviewDeps) {
    this.render = deps.render ?? renderMarkdown
    this.setTimer = deps.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? (timer => clearTimeout(timer))
    this.panel.addEventListener('click', event => {
      const anchor = (event.target as HTMLElement).closest('a')
      if (anchor) event.preventDefault()
    })
  }

  isVisible(): boolean { return this.visible }

  toggle(bufferId: string, markdown: string): boolean {
    this.visible = !this.visible
    this.panel.classList.toggle('hidden', !this.visible)
    this.cancelPending()
    this.bufferId = bufferId
    if (this.visible) this.renderNow(markdown)
    this.deps.onLayout()
    return this.visible
  }

  switchBuffer(bufferId: string, markdown: string): void {
    this.cancelPending()
    this.bufferId = bufferId
    if (this.visible) this.renderNow(markdown)
  }

  update(bufferId: string, markdown: string): void {
    if (!this.visible) return
    if (bufferId !== this.bufferId) {
      this.switchBuffer(bufferId, markdown)
      return
    }
    this.cancelTimer()
    const generation = this.generation
    this.timer = this.setTimer(() => {
      this.timer = null
      if (this.visible && generation === this.generation && this.bufferId === bufferId) {
        this.renderNow(markdown)
      }
    }, 150)
  }

  dispose(): void {
    this.visible = false
    this.cancelPending()
  }

  private renderNow(markdown: string): void {
    try { this.panel.innerHTML = this.render(markdown) }
    catch { this.panel.textContent = 'Preview failed to render.' }
  }

  private cancelPending(): void {
    this.generation++
    this.cancelTimer()
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    this.clearTimer(this.timer)
    this.timer = null
  }
}
