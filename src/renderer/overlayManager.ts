// One reliable, consistent overlay-dismissal mechanism. Overlays push a close
// callback on open and call the returned unregister fn on close; a single
// capture-phase Escape listener closes the TOPMOST overlay from anywhere,
// independent of focus (fixes overlays Monaco/focus used to swallow Esc for).
const stack: Array<() => void> = []

export function pushOverlay(close: () => void): () => void {
  stack.push(close)
  return () => {
    const i = stack.indexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

export function openCount(): number {
  return stack.length
}

/**
 * One overlay's slot on the stack — the registration half of the open/close contract.
 *
 * Every overlay used to hand-roll this as a `private unreg?: () => void` field, and every one
 * of them had the same latent bug: `open()` on an ALREADY-OPEN overlay (Ctrl+P pressed twice,
 * a palette command re-run, the gear button clicked again) pushed a SECOND callback while the
 * field kept only the newest. `close()` then popped one and orphaned the other, leaving a dead
 * entry that outlives the overlay — and since handleEscape() preventDefault+stopPropagation's
 * whatever it finds on top, the next Escape gets eaten by the corpse instead of reaching
 * Monaco's find widget / multi-cursor. One swallowed keypress per re-entrant open.
 *
 * Holding the slot here instead makes that structurally impossible: open() releases before it
 * re-registers, so an overlay can never own more than one entry no matter how it's driven.
 */
export class OverlayRegistration {
  private unreg?: () => void

  /** Register (or re-register) this overlay's close callback. Safe to call while already open. */
  open(close: () => void): void {
    this.unreg?.()
    this.unreg = pushOverlay(close)
  }

  /** Give up the slot. Idempotent — a second call can't pop another overlay's entry. */
  release(): void {
    this.unreg?.()
    this.unreg = undefined
  }
}

// Exported for unit testing without a DOM. Closes the topmost overlay on Escape.
export function handleEscape(e: { key: string; preventDefault(): void; stopPropagation(): void }): void {
  if (e.key === 'Escape' && stack.length) {
    e.preventDefault()
    e.stopPropagation()
    stack[stack.length - 1]()
  }
}

// Capture phase so we run before Monaco / overlay inputs can consume Escape.
// Guarded so the module imports cleanly in the Vitest node env (no window).
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleEscape as (e: KeyboardEvent) => void, true)
}
