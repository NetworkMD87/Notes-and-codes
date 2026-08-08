import { DialogController } from './dialogController'

export interface InputOverlayOptions {
  initial?: string
  confirmLabel?: string
  focusFallback: () => void
}

export function promptInput(title: string, options: InputOverlayOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'input-overlay'
    const box = document.createElement('section')
    box.className = 'input-box'
    const id = crypto.randomUUID()
    const label = document.createElement('label'); label.id = `input-overlay-title-${id}`; label.textContent = title; label.className = 'input-title'
    const field = document.createElement('input'); field.id = `input-overlay-field-${id}`; field.value = options.initial ?? ''; label.htmlFor = field.id
    const ok = document.createElement('button'); ok.textContent = 'OK'
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
    box.append(label, field, ok, cancel)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const dialog = new DialogController(options.focusFallback)
    let settled = false
    const done = (val: string | null) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      dialog.close()
      resolve(val)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); done(field.value.trim() || null) }
      // Escape is handled centrally by overlayManager through DialogController.
    }
    ok.onclick = () => done(field.value.trim() || null)
    cancel.onclick = () => done(null)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null) })
    document.addEventListener('keydown', onKey, true)
    dialog.open({ panel: box, labelledBy: label.id, initialFocus: field, requestClose: () => done(null) })
  })
}

// Themed yes/cancel confirmation (no native confirm()). Resolves true on confirm, false on
// cancel/Escape/click-out. Reuses the .input-overlay/.input-box chrome.
export function confirmDialog(message: string, options: InputOverlayOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'input-overlay'
    const box = document.createElement('section')
    box.className = 'input-box'
    const id = crypto.randomUUID()
    const label = document.createElement('div'); label.id = `input-overlay-title-${id}`; label.textContent = message; label.className = 'input-title'
    const ok = document.createElement('button'); ok.textContent = options.confirmLabel ?? 'Delete'
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
    box.append(label, ok, cancel)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const dialog = new DialogController(options.focusFallback)
    let settled = false
    const done = (val: boolean) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      dialog.close()
      resolve(val)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); done(true) }
      // Escape is handled centrally by overlayManager through DialogController.
    }
    ok.onclick = () => done(true)
    cancel.onclick = () => done(false)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false) })
    dialog.open({ panel: box, labelledBy: label.id, initialFocus: box, requestClose: () => done(false) })
    // Arm Enter-to-confirm + focus only AFTER the current keystroke completes.
    // An Enter that opened this dialog must not confirm it before the user sees it.
    requestAnimationFrame(() => {
      if (settled) return
      document.addEventListener('keydown', onKey, true)
      ok.focus()
    })
  })
}
