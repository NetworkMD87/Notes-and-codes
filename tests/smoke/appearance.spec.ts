import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function openAppearance(win: Page) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Appearance')
  await win.keyboard.press('Enter')
  await expect(win.locator('#appearance')).toBeVisible()
}

test('Appearance: Interface font sets --ui-font; Editor font is relabeled', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)

    // editor font control is relabeled
    await expect(win.locator('.appearance-row', { hasText: 'Editor font' })).toBeVisible()

    // interface font control is present and changes --ui-font on the body
    const uiRow = win.locator('.appearance-row', { hasText: 'Interface font' })
    await expect(uiRow).toBeVisible()
    await uiRow.locator('select').selectOption('Fira Code')
    await expect
      .poll(() => win.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ui-font')), { timeout: 3000 })
      .toContain('Fira Code')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Appearance: renders landscape — theme list left, settings right', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-cols-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)

    await expect(win.locator('.appearance-col-left')).toBeVisible()
    await expect(win.locator('.appearance-col-right')).toBeVisible()
    // theme list + accent swatches are in the left column; font settings in the right
    await expect(win.locator('.appearance-col-left .appearance-themes')).toBeVisible()
    await expect(win.locator('.appearance-col-left .appearance-sw')).toBeVisible()
    await expect(win.locator('.appearance-col-right .appearance-row', { hasText: 'Interface font' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Appearance: every theme row shows four palette swatches', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-sw-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)

    await expect(win.locator('#appearance .appearance-theme')).toHaveCount(14)
    await expect(win.locator('#appearance .appearance-theme .theme-dots')).toHaveCount(14)
    await expect(win.locator('#appearance .appearance-theme .theme-dot')).toHaveCount(56)

    // Monokai's dots are Monokai's own palette: editorbg / bar / bartext / accent
    const colours = await win.locator('.appearance-theme', { hasText: 'Monokai' })
      .locator('.theme-dot')
      .evaluateAll(els => els.map(e => (e as HTMLElement).style.background))
    expect(colours).toEqual([
      'rgb(39, 40, 34)',    // #272822 editor bg
      'rgb(30, 31, 28)',    // #1e1f1c bar
      'rgb(248, 248, 242)', // #f8f8f2 bar text
      'rgb(249, 38, 114)'   // #f92672 accent
    ])
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
