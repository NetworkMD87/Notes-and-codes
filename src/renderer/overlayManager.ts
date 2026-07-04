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
