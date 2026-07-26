import { expect, type Page } from '@playwright/test'

// Plain .ts (NOT .spec.ts) on purpose — see settingsHelper.ts for why.

/** Wait until the renderer has finished `boot()`.
 *
 *  `#tabbar` is NOT a readiness signal: it is static markup in index.html, so it paints almost
 *  immediately, long before boot() has applied persisted settings. A test that acts on that cue
 *  can have its action silently overwritten — boot() re-applies `settings.alwaysOnTop`
 *  unconditionally, so a "Toggle Always on Top" landing first is reverted a moment later.
 *
 *  Use this anywhere a test changes state that boot() also writes. `#tabbar` remains fine as a
 *  "window is up" check for tests that only read, which is why the whole suite was not swept. */
export async function waitForBoot(win: Page) {
  await expect(win.locator('body[data-booted]')).toBeAttached()
}
