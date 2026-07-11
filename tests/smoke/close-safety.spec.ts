import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Audit Phase 1 — H2 (palette "Close Tab" bypasses closeTab safeguards) and
// M1 (closing a dirty *untitled* tab discards content with no warning).

async function launch() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-close-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  return { app, userDataDir }
}

async function dirtyTheActiveTab(win: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.type('unsaved scratch notes')
}

// M1: the tab-bar × already routes through closeTab; the dirty-confirm must now
// fire for an untitled buffer with content, not only named files.
test('closing a dirty untitled tab via the × warns before discarding', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('.tab')).toHaveCount(1)

    await dirtyTheActiveTab(win)
    await win.locator('.tab').first().locator('.tab-close').click()

    // A themed Discard confirm must appear — the untitled content isn't gone yet.
    await expect(win.locator('.input-overlay')).toBeVisible()
    await expect(win.locator('.input-overlay button', { hasText: 'Discard' })).toBeVisible()

    // Cancel keeps the tab and its content.
    await win.locator('.input-overlay button', { hasText: 'Cancel' }).click()
    await expect(win.locator('.input-overlay')).toBeHidden()
    await expect(win.locator('.tab')).toHaveCount(1)
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

// H2: the command-palette "Close Tab" must route through closeTab — so the same
// dirty-confirm fires there too (today it calls manager.close() raw and skips it).
test('command-palette Close Tab warns before discarding a dirty tab', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    await dirtyTheActiveTab(win)
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Close Tab')
    await win.keyboard.press('Enter')

    await expect(win.locator('.input-overlay')).toBeVisible()
    await expect(win.locator('.input-overlay button', { hasText: 'Discard' })).toBeVisible()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

// Same Enter-bleed class as the confirm: a palette command that opens promptInput
// (Save Selection as Snippet) must not have its triggering Enter bleed through and
// auto-submit the name prompt.
test('palette command that opens a text prompt does not auto-submit it', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // A non-empty selection so Save Selection as Snippet reaches the name prompt.
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.type('reusable snippet body')
    await win.keyboard.press('Control+A')

    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save Selection as Snippet')
    await win.keyboard.press('Enter')

    // The name prompt (an .input-overlay with a text field) must stay open.
    await expect(win.locator('.input-overlay input')).toBeVisible()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

// H2 (isolation): only closeTab hides the window when the last tab closes. If the
// palette still called manager.close() raw, the window would stay visible.
test('command-palette Close Tab on the last tab hides to tray', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('.tab')).toHaveCount(1)

    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Close Tab')
    await win.keyboard.press('Enter')

    await expect.poll(
      () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      { timeout: 5000 }
    ).toBe(false)
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})
