const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * electron-vite supplies a renderer URL while developing. Never let a packaged build, or a
 * non-loopback URL inherited from the environment, replace the app's trusted renderer.
 */
export function trustedDevRendererUrl(raw: string | undefined, isPackaged: boolean): URL | null {
  if (isPackaged || !raw) return null
  try {
    const url = new URL(raw)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
      return null
    }
    return url
  } catch {
    return null
  }
}
