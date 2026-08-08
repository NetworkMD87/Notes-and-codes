import { OverlayRegistration } from './overlayManager'

export interface DialogOpenOptions {
  panel: HTMLElement
  labelledBy: string
  describedBy?: string
  initialFocus?: HTMLElement | null
  requestClose: () => void
}

const FOCUSABLE = [
  'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => (
    el.isConnected && !el.closest('[hidden],[aria-hidden="true"]')
  ))
}

export class DialogController {
  private readonly registration = new OverlayRegistration()
  private panel: HTMLElement | null = null
  private opener: HTMLElement | null = null
  private opened = false

  constructor(private readonly fallbackFocus: () => void) {}

  open(options: DialogOpenOptions): void {
    if (!this.opened) this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (this.panel !== options.panel) this.panel?.removeEventListener('keydown', this.onKeyDown)
    this.panel = options.panel
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', options.labelledBy)
    if (options.describedBy) this.panel.setAttribute('aria-describedby', options.describedBy)
    else this.panel.removeAttribute('aria-describedby')
    this.panel.tabIndex = -1
    this.panel.removeEventListener('keydown', this.onKeyDown)
    this.panel.addEventListener('keydown', this.onKeyDown)
    this.opened = true
    this.registration.open(options.requestClose)
    const target = this.usable(options.initialFocus) ? options.initialFocus! : focusableElements(this.panel)[0] ?? this.panel
    target.focus()
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.registration.release()
    this.panel?.removeEventListener('keydown', this.onKeyDown)
    const opener = this.opener
    this.panel = null; this.opener = null
    if (this.usable(opener)) opener.focus()
    else this.fallbackFocus()
  }

  isOpen(): boolean { return this.opened }

  private usable(el: HTMLElement | null | undefined): el is HTMLElement {
    if (!el?.isConnected || el.matches(':disabled') || el.closest('[hidden],[aria-hidden="true"],[inert]')) return false
    for (let current: HTMLElement | null = el; current; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !this.panel) return
    const items = focusableElements(this.panel)
    if (!items.length) { event.preventDefault(); this.panel.focus(); return }
    const active = document.activeElement
    const edge = event.shiftKey ? items[0] : items[items.length - 1]
    if (!this.panel.contains(active) || active === edge) {
      event.preventDefault()
      ;(event.shiftKey ? items[items.length - 1] : items[0]).focus()
    }
  }
}
