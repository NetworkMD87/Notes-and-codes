/**
 * The only trusted IPC sender is the app window's own main frame. We compare frame
 * **identity** (not the frame URL, which a nested/child frame could match) and reject when
 * there is no trusted frame — i.e. the window is absent or destroyed. Registered handlers
 * run through this so a stray frame (a future embedded webview, a devtools context, the
 * offscreen export window) can't drive the fs-capable channels.
 *
 * Typed as `object | null` rather than electron's `WebFrameMain` so this stays a pure,
 * electron-free unit (identity check only) — `tests/unit/senderGuard.test.ts` exercises it
 * with plain stand-in objects.
 */
export function isTrustedSender(
  sender: object | null,
  trusted: object | null | undefined
): boolean {
  return trusted != null && sender === trusted
}
