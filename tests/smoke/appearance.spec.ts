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

test('Appearance: hovering a theme row previews it; leaving the list reverts', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-hover-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)
    const committed = await win.evaluate(() => document.body.dataset.theme)

    await win.locator('.appearance-theme', { hasText: 'Monokai' }).hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('monokai')

    // the active-row highlight stays on the COMMITTED theme while previewing another
    await expect(win.locator('.appearance-theme.active')).not.toContainText('Monokai')

    // moving off the theme grid reverts
    await win.locator('#appearance .accent-head h3').hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe(committed)

    // this session previewed Monokai and committed nothing — relaunch against the same
    // profile and confirm the committed theme is still what it was. A leaked preview
    // write would show up as 'monokai' here, since nothing in this session overwrites it
    // (unlike the Escape/commit test below, whose later Nord commit would mask a leak).
    await win.keyboard.press('Escape')
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 5000 }).toBe(committed)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Appearance: Escape mid-preview reverts; a click commits and survives relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-commit-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)
    const committed = await win.evaluate(() => document.body.dataset.theme)

    // preview, then close with Escape while the pointer is still on the row —
    // no mouseleave fires, so close() is the only thing that can revert it
    await win.locator('.appearance-theme', { hasText: 'Dracula' }).hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('dracula')
    await win.keyboard.press('Escape')
    await expect(win.locator('#appearance')).toBeHidden()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe(committed)

    // a click DOES commit, and the preview never wrote anything
    await openAppearance(win)
    await win.locator('.appearance-theme', { hasText: 'Nord' }).click()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('nord')
    await win.keyboard.press('Escape')
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 5000 }).toBe('nord')
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
