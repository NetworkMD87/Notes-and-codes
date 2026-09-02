import { renderMarkdown } from './markdownRender'

export interface MarkdownPreviewDeps {
  render?: (markdown: string) => string
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

export class MarkdownPreview {
  private active = false
  private bufferId: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private generation = 0
  private revision = 0
  private disposed = false
  private readonly render: (markdown: string) => string
  private readonly setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void
  private readonly handlePanelClick = (event: MouseEvent): void => {
    const anchor = (event.target as HTMLElement).closest('a')
    if (anchor) event.preventDefault()
  }

  constructor(private panel: HTMLElement, deps: MarkdownPreviewDeps) {
    this.render = deps.render ?? renderMarkdown
    this.setTimer = deps.setTimer ?? ((callback, delay) => setTimeout(callback, delay))
    this.clearTimer = deps.clearTimer ?? (timer => clearTimeout(timer))
    this.panel.addEventListener('click', this.handlePanelClick)
  }

  isActive(): boolean { return this.active }

  setActive(active: boolean, bufferId: string, markdown: string): boolean {
    if (this.disposed) return false
    this.active = active
    this.cancelPending()
    this.bufferId = bufferId
    if (active) this.renderNow(markdown)
    return true
  }

  switchBuffer(bufferId: string, markdown: string): void {
    if (this.disposed) return
    this.cancelPending()
    this.bufferId = bufferId
    if (this.active) this.renderNow(markdown)
  }

  update(bufferId: string, markdown: string): void {
    const revision = ++this.revision
    if (this.disposed || !this.active) return
    if (bufferId !== this.bufferId) {
      this.switchBuffer(bufferId, markdown)
      return
    }
    this.cancelTimer()
    const generation = this.generation
    let timer!: ReturnType<typeof setTimeout>
    timer = this.setTimer(() => {
      if (this.timer === timer) this.timer = null
      if (!this.disposed && this.active && generation === this.generation
        && revision === this.revision && this.bufferId === bufferId) {
        this.renderNow(markdown)
      }
    }, 150)
    this.timer = timer
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.active = false
    this.cancelPending()
    this.panel.removeEventListener('click', this.handlePanelClick)
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
