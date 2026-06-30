export function promptInput(title: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'input-overlay'
    const box = document.createElement('div')
    box.className = 'input-box'
    const label = document.createElement('div'); label.textContent = title; label.className = 'input-title'
    const field = document.createElement('input'); field.value = initial
    const ok = document.createElement('button'); ok.textContent = 'OK'
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
    box.append(label, field, ok, cancel)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    const done = (val: string | null) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(val) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); done(field.value.trim() || null) }
      else if (e.key === 'Escape') { e.preventDefault(); done(null) }
    }
    ok.onclick = () => done(field.value.trim() || null)
    cancel.onclick = () => done(null)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null) })
    document.addEventListener('keydown', onKey, true)
    field.focus()
  })
}

// Themed yes/cancel confirmation (no native confirm()). Resolves true on confirm, false on
// cancel/Escape/click-out. Reuses the .input-overlay/.input-box chrome.
export function confirmDialog(message: string, confirmLabel = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'input-overlay'
    const box = document.createElement('div')
    box.className = 'input-box'
    const label = document.createElement('div'); label.textContent = message; label.className = 'input-title'
    const ok = document.createElement('button'); ok.textContent = confirmLabel
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'
    box.append(label, ok, cancel)
    overlay.appendChild(box)
    document.body.appendChild(overlay)
    let settled = false
    const done = (val: boolean) => {
      if (settled) return
      settled = true
      document.removeEventListener('keydown', onKey, true)
      overlay.remove(); resolve(val)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false) }
      else if (e.key === 'Enter') { e.preventDefault(); done(true) }
    }
    ok.onclick = () => done(true)
    cancel.onclick = () => done(false)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false) })
    document.addEventListener('keydown', onKey, true)
    ok.focus()
  })
}
