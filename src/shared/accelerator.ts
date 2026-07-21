/**
 * Keystroke → Electron accelerator, and back to display chips.
 *
 * Lives in shared/ (not renderer/) because BOTH processes need it: the renderer builds the
 * string from a recorded keydown and renders the chips, and main sanity-checks the string it
 * is about to hand to globalShortcut.register. Same rationale as THEME_LIST / ACCENT_PALETTE.
 *
 * Pure — no DOM, no electron. accelFromEvent takes a structural subset of KeyboardEvent so
 * it can be unit-tested with plain objects in a node-env test.
 */

export type AccelResult = { ok: true; accel: string } | { ok: false; reason: string }

export type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>

const NEEDS_MODIFIER = 'Add a modifier — Ctrl, Alt, or Shift.'

/** Bare keys we refuse to bind: they are how you cancel/navigate the recorder itself. */
const BLOCKED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter'])

const ARROWS: Record<string, string> = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
}

/** Map a KeyboardEvent.code to the key name Electron's accelerator syntax expects.
 *  Uses `code` (physical key) rather than `key`, so a shifted keystroke records as the
 *  unshifted key — Ctrl+Shift+1 must not record as Ctrl+Shift+!. */
function keyNameFrom(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (code in ARROWS) return ARROWS[code]
  switch (code) {
    case 'Space': return 'Space'
    case 'Backspace': return 'Backspace'
    case 'Delete': return 'Delete'
    case 'Insert': return 'Insert'
    case 'Home': return 'Home'
    case 'End': return 'End'
    case 'PageUp': return 'PageUp'
    case 'PageDown': return 'PageDown'
    case 'Comma': return ','
    case 'Period': return '.'
    case 'Slash': return '/'
    case 'Backslash': return '\\'
    case 'Semicolon': return ';'
    case 'Quote': return "'"
    case 'BracketLeft': return '['
    case 'BracketRight': return ']'
    case 'Minus': return '-'
    case 'Equal': return '='
    case 'Backquote': return '`'
    default: return null
  }
}

export function accelFromEvent(e: KeyLike): AccelResult {
  if (BLOCKED.has(e.code)) return { ok: false, reason: `${e.code} can't be used as a shortcut.` }

  const name = keyNameFrom(e.code)
  // Modifier-only keydowns land here while the user is still assembling the combo —
  // not an error to show, just not a complete keystroke yet.
  if (!name) return { ok: false, reason: 'Press a key to finish the shortcut.' }

  // Shift alone is not a real modifier for a GLOBAL hotkey: Shift+A is just typing A.
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return { ok: false, reason: NEEDS_MODIFIER }

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(name)
  return { ok: true, accel: parts.join('+') }
}

/** Accelerator string → display chips. '' (a deliberately cleared hotkey) → []. */
export function formatAccel(accel: string): string[] {
  if (!accel) return []
  return accel.split('+').map(p => (p === 'CommandOrControl' ? 'Ctrl' : p))
}
