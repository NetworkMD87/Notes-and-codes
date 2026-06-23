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
    const done = (val: string | null) => { overlay.remove(); resolve(val) }
    ok.onclick = () => done(field.value.trim() || null)
    cancel.onclick = () => done(null)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null) })
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(field.value.trim() || null)
      if (e.key === 'Escape') done(null)
    })
    field.focus()
  })
}
