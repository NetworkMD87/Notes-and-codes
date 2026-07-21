import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

async function launch() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-esc-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  return { app, userDataDir }
}

test('Escape closes overlays that previously had no Esc handler', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // Settings panel — gained Esc-close this slice (ported from the old Appearance panel)
    await openSettings(win)
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Escape closes the command palette from any focus', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()   // renderer ready (keydown listener attached)
    await win.keyboard.press('Control+Shift+P')
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('#palette')).toBeHidden()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Escape closes only the topmost of two stacked overlays', async () => {
  const { app, userDataDir } = await launch()
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()   // renderer ready (keydown listener attached)
    await openSettings(win)
    await win.keyboard.press('Control+Shift+P')          // palette on top of settings
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    await win.keyboard.press('Escape')                   // closes palette only
    await expect(win.locator('#palette')).toBeHidden()
    await expect(win.locator('#settings')).toBeVisible()
    await win.keyboard.press('Escape')                   // then settings
    await expect(win.locator('#settings')).toBeHidden()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})
