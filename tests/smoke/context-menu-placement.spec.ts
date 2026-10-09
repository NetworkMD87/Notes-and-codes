import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'
import type { ElectronApplication, Page } from '@playwright/test'
import type { SmokeResources } from './smokeCleanup'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

async function launch(smoke: SmokeResources, userDataDir: string, filePath?: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const args = ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  if (filePath) args.push(filePath)
  const app = await smoke.launch({ args })
  const win = await app.firstWindow()
  await waitForBoot(win)
  return { app, win }
}

async function expectMenuInsideViewport(win: Page): Promise<void> {
  const menu = win.locator('#ctx-menu')
  await menu.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined)))
  })
  const bounds = await menu.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: window.innerWidth, height: window.innerHeight,
    }
  })
  expect(bounds.left).toBeGreaterThanOrEqual(8)
  expect(bounds.top).toBeGreaterThanOrEqual(8)
  expect(bounds.right).toBeLessThanOrEqual(bounds.width - 8)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 8)
}

test('toolbar menus flip, scroll focused items into view, and close on resize', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-menu-toolbar-')
  const filePath = join(userDataDir, 'notes.md')
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(filePath, '# Notes\n')
  const { app, win } = await launch(smoke, userDataDir, filePath)
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(320, 240)
  })
  await win.locator('#toolbar').evaluate(toolbar => {
    Object.assign((toolbar as HTMLElement).style, { position: 'fixed', right: '0', bottom: '0' })
  })
  const opener = win.locator('[data-toolbar="markdown-tools"]')
  await opener.click()
  const menu = win.locator('#ctx-menu')
  await expect(menu).toBeVisible()
  await expectMenuInsideViewport(win)
  await expect(win.getByRole('menuitem').first()).toBeFocused()

  await win.keyboard.press('End')
  await expect(win.getByRole('menuitem').last()).toBeFocused()
  expect(await menu.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const visible = await menu.evaluate(element => {
    const row = element.querySelector('.ctx-item:last-child')!.getBoundingClientRect()
    const menu = element.getBoundingClientRect()
    return row.top >= menu.top && row.bottom <= menu.bottom
  })
  expect(visible).toBe(true)
  await win.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await expect(menu).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(340, 260))
  await expect(menu).toHaveCount(0)
})

test('initial long folder labels wrap in a bounded scrollable keyboard menu', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-menu-long-label-user-')
  const root = smoke.tempDir('notes-menu-long-label-root-')
  const recent = Array.from({ length: 10 }, (_, index) => {
    const path = join(root, `${'long-folder-name-'.repeat(7)}${index}`)
    mkdirSync(path)
    return path
  })
  writeFileSync(join(userDataDir, 'recent-folders.json'), JSON.stringify(recent))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    lastFolder: root, restoreFolderOnLaunch: true, sidebarVisible: true,
  }))
  const { win } = await launch(smoke, userDataDir)
  await win.setViewportSize({ width: 340, height: 260 })
  const opener = win.getByRole('button', { name: 'Switch folder' })
  await opener.focus(); await opener.press('Enter')
  const menu = win.locator('#ctx-menu')
  await expect(menu).toBeVisible()
  await expectMenuInsideViewport(win)
  const row = menu.getByRole('menuitem').first()
  const wrapping = await row.evaluate(element => ({
    height: element.getBoundingClientRect().height,
    whiteSpace: getComputedStyle(element).whiteSpace,
    overflowWrap: getComputedStyle(element).overflowWrap,
  }))
  expect(wrapping.whiteSpace).toBe('normal')
  expect(wrapping.overflowWrap).toBe('anywhere')
  expect(wrapping.height).toBeGreaterThan(30)
  await win.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Close Folder' })).toBeFocused()
  const scrolled = await menu.evaluate(element => {
    const last = element.querySelector('.ctx-item:last-child')!.getBoundingClientRect()
    const bounds = element.getBoundingClientRect()
    return { overflow: element.scrollHeight > element.clientHeight, visible: last.top >= bounds.top && last.bottom <= bounds.bottom }
  })
  expect(scrolled).toEqual({ overflow: true, visible: true })
  await win.keyboard.press('Escape')
  await expect(opener).toBeFocused()
})

test('folder row context menus stay inside the viewport at the lower-right edge', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-menu-folder-user-')
  const root = smoke.tempDir('notes-menu-folder-root-')
  const filePath = join(root, 'readme.md')
  writeFileSync(filePath, '# Folder')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    lastFolder: root, restoreFolderOnLaunch: true,
  }))
  const { app, win } = await launch(smoke, userDataDir)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(340, 260))
  const row = win.locator('.sb-row', { hasText: 'readme.md' })
  await expect(row).toBeVisible()
  await row.evaluate(element => {
    Object.assign((element as HTMLElement).style, { position: 'fixed', right: '0', bottom: '0', width: '130px', zIndex: '99' })
  })
  await row.click({ button: 'right' })
  await expect(win.locator('#ctx-menu')).toBeVisible()
  await expectMenuInsideViewport(win)
  await expect(win.getByRole('menuitem', { name: 'Rename…' })).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.locator('#ctx-menu')).toHaveCount(0)
})

test('spelling context menus stay within the viewport', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-menu-spell-user-')
  const filePath = join(userDataDir, 'spell.txt')
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(filePath, 'mispelled')
  const { app, win } = await launch(smoke, userDataDir, filePath)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(340, 260))
  const underline = win.locator('#paneA .spell-error').first()
  await expect(underline).toBeVisible()
  const bounds = await underline.boundingBox()
  if (!bounds) throw new Error('Spell-error underline has no pointer target')
  await win.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { button: 'right' })
  await expect(win.locator('#ctx-menu')).toBeVisible()
  await expectMenuInsideViewport(win)
  await expect(win.getByRole('menuitem', { name: 'Ignore for this session' })).toBeVisible()
  await win.keyboard.press('Escape')
})
