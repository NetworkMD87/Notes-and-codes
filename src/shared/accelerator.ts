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
const NEEDS_MORE_INPUT = 'Press a key to finish the shortcut.'

/** Bare keys we refuse to bind: they are how you cancel/navigate the recorder itself. */
const BLOCKED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter'])

/** Physical modifier keys. A keydown on one of these ALONE means the combo isn't finished yet
 *  (the user is still holding a modifier down) — not the same situation as a fully-pressed key
 *  Electron's accelerator syntax simply has no name for (CapsLock, a media key, …). */
const MODIFIER_ONLY_CODES = new Set([
  'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
])

/** Friendly labels for keys that only ever appear in user-facing error text (never fed to
 *  Electron) — so a message reads "Numpad Enter", not the raw DOM code "NumpadEnter". Codes with
 *  no entry here already read fine as-is (e.g. 'Escape', 'Tab'). */
const FRIENDLY_LABEL: Record<string, string> = {
  NumpadEnter: 'Numpad Enter',
  NumpadDecimal: 'Numpad .',
  NumpadAdd: 'Numpad +',
  NumpadSubtract: 'Numpad -',
  NumpadMultiply: 'Numpad *',
  NumpadDivide: 'Numpad /',
  NumpadEqual: 'Numpad =',
  NumpadComma: 'Numpad ,',
  CapsLock: 'Caps Lock',
  NumLock: 'Num Lock',
  ScrollLock: 'Scroll Lock',
  PrintScreen: 'Print Screen',
  ContextMenu: 'Menu',
  Pause: 'Pause',
  MediaPlayPause: 'Media Play/Pause',
  MediaStop: 'Media Stop',
  MediaTrackNext: 'Media Next Track',
  MediaTrackPrevious: 'Media Previous Track',
  AudioVolumeMute: 'Volume Mute',
  AudioVolumeDown: 'Volume Down',
  AudioVolumeUp: 'Volume Up',
  BrowserBack: 'Browser Back',
  BrowserForward: 'Browser Forward',
  BrowserRefresh: 'Browser Refresh',
  BrowserSearch: 'Browser Search',
  BrowserFavorites: 'Browser Favorites',
  BrowserHome: 'Browser Home',
  BrowserStop: 'Browser Stop',
}

/** A user-facing label for a DOM `code`, for error text only — never for the accelerator itself. */
function friendlyLabel(code: string): string {
  const numpadDigit = /^Numpad([0-9])$/.exec(code)
  if (numpadDigit) return `Numpad ${numpadDigit[1]}`
  return FRIENDLY_LABEL[code] ?? code
}

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
  if (BLOCKED.has(e.code)) {
    return { ok: false, reason: `${friendlyLabel(e.code)} can't be used as a shortcut.` }
  }

  // Alt+F4 (and ONLY that exact chord — no extra Ctrl/Shift/Super) is Windows' own "close the
  // active window" combo, honoured system-wide by every app, not just this one. Recording it
  // as the global summon hotkey would silently steal window-closing away entirely until the
  // user notices and re-records something else — bad enough to guard specifically, even
  // though bare F4 (or F4 with a different modifier mix, e.g. Ctrl+Alt+F4) is unreserved and
  // fine. BLOCKED above only ever matches by bare code, not by modifier combination, so it
  // can't express "block this one specific chord" the way this needs.
  if (e.code === 'F4' && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
    return { ok: false, reason: "Alt+F4 can't be used as a shortcut — it closes windows system-wide." }
  }

  const name = keyNameFrom(e.code)
  if (!name) {
    // Modifier-only keydowns land here while the user is still assembling the combo — not an
    // error to show, just not a complete keystroke yet. Anything else unmapped (CapsLock,
    // NumLock, numpad digits, media keys, PrintScreen, ContextMenu, …) IS a finished keystroke —
    // Electron's accelerator syntax just has no name for it — so it gets its own accurate
    // reason instead of the misleading "keep going" message.
    if (MODIFIER_ONLY_CODES.has(e.code)) return { ok: false, reason: NEEDS_MORE_INPUT }
    return { ok: false, reason: `${friendlyLabel(e.code)} can't be used as a shortcut.` }
  }

  // Shift alone is not a real modifier for a GLOBAL hotkey: Shift+A is just typing A.
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return { ok: false, reason: NEEDS_MODIFIER }

  // Deterministic modifier order (Electron's parser doesn't care, but tests and the display
  // chips need a stable order regardless of which flags happened to be read first):
  // CommandOrControl, Super, Alt, Shift. Ctrl and the Windows/Super key are kept as separate,
  // honestly-reported modifiers (see below) but sit next to each other since both are "OS key"
  // modifiers; Alt then Shift follow, matching the original Ctrl → Alt → Shift ordering.
  const parts: string[] = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  // metaKey is the Windows/Super key. On Windows, Electron resolves 'CommandOrControl' to the
  // literal Ctrl key — folding metaKey into that bucket would make a recorded Win+N silently
  // register as Ctrl+N (a different combo than the one the user pressed). Report it honestly
  // as Electron's distinct 'Super' modifier instead; metaKey still qualifies as a modifier on
  // its own (checked above), so Win+<key> remains a legal combo to record.
  if (e.metaKey) parts.push('Super')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(name)
  return { ok: true, accel: parts.join('+') }
}

/** Accelerator string → display chips. '' (a deliberately cleared hotkey) → []. */
export function formatAccel(accel: string): string[] {
  if (!accel) return []
  return accel.split('+').map(p => {
    if (p === 'CommandOrControl') return 'Ctrl'
    if (p === 'Super') return 'Win'
    return p
  })
}
