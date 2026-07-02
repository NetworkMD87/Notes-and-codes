/** Resolve a chosen interface-font name to a CSS font stack for app chrome.
 *  'System' (the default) yields the built-in Windows UI stack — no visual change. */
export function uiFontStack(name: string): string {
  if (name === 'System') return 'Segoe UI, system-ui, sans-serif'
  return `'${name}', system-ui, sans-serif`
}
