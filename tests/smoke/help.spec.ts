import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function runCmd(win: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>, label: string) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

test('Help: Keyboard Shortcuts overlay renders, filters, and closes on Esc', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-help-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    await runCmd(win, 'Help: Shortcuts & Commands')
    await expect(win.locator('.help-overlay')).toBeVisible()
    // six categories render
    await expect(win.locator('.help-cat')).toHaveCount(6)

    // total rows before filtering
    const total = await win.locator('.help-row').count()
    expect(total).toBeGreaterThan(0)

    // type "save" → only matching rows stay visible
    await win.locator('.help-search').fill('save')
    const visibleAfter = win.locator('.help-row:visible')
    await expect.poll(() => visibleAfter.count(), { timeout: 3000 }).toBeLessThan(total)
    await expect.poll(() => visibleAfter.count(), { timeout: 3000 }).toBeGreaterThan(0)
    // every visible row matches the query (via label or keys)
    await expect(win.locator('.help-row:visible', { hasText: /save/i })).toHaveCount(await visibleAfter.count())

    // clear the query → all rows return
    await win.locator('.help-search').fill('')
    await expect.poll(() => win.locator('.help-row:visible').count(), { timeout: 3000 }).toBe(total)

    // Esc closes
    await win.locator('.help-search').press('Escape')
    await expect(win.locator('.help-overlay')).toBeHidden()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Help: About shows the live version and link buttons', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-help-about-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    await runCmd(win, 'Help: About Notes & Codes')
    await expect(win.locator('.help-overlay')).toBeVisible()
    // wordmark logo renders (replaces the old text name)
    await expect(win.locator('.about-logo svg')).toBeVisible()
    // version reflects the live app.getVersion() (real app version when packaged,
    // Electron's version when run unpackaged as smoke does) — assert against the
    // same source rather than a hardcoded package version, so both modes pass.
    const reported = await win.evaluate(() => (window as any).api.getAppVersion())
    await expect(win.locator('.about-version')).toHaveText('v' + reported, { timeout: 3000 })
    await expect(win.locator('.about-link')).toHaveCount(3)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
