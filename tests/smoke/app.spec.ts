import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('launches, creates tabs, splits, toggles theme', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // clean start = exactly one auto-created tab
    await expect(win.locator('.tab')).toHaveCount(1)

    // New Tab via palette -> two tabs
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('New Tab')
    await win.keyboard.press('Enter')
    await expect(win.locator('.tab')).toHaveCount(2)

    // Toggle Split -> paneB visible
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Split')
    await win.keyboard.press('Enter')
    await expect(win.locator('#paneB')).toBeVisible()

    // Theme toggle sets body dataset
    await win.click('#theme-toggle')
    const theme = await win.evaluate(() => document.body.dataset.theme)
    expect(['light', 'dark']).toContain(theme)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('markdown preview toggles and paste-history picker opens', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Toggle Markdown Preview -> panel visible
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Markdown Preview')
    await win.keyboard.press('Enter')
    await expect(win.locator('#mdpreview')).toBeVisible()

    // Paste from History -> picker overlay appears
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Paste from History')
    await win.keyboard.press('Enter')
    await expect(win.locator('.ph-picker')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('toolbar split and preview buttons work and show active state', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#toolbar')).toBeVisible()

    // Split button -> paneB visible + button active
    const splitBtn = win.locator('.tb-btn[title="Toggle split pane"]')
    await splitBtn.click()
    await expect(win.locator('#paneB')).toBeVisible()
    await expect(splitBtn).toHaveClass(/tb-active/)

    // Preview button -> preview panel visible + button active
    const previewBtn = win.locator('.tb-btn[title="Toggle markdown preview"]')
    await previewBtn.click()
    await expect(win.locator('#mdpreview')).toBeVisible()
    await expect(previewBtn).toHaveClass(/tb-active/)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('paste-history picker renders above the editor minimap in split mode', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Split: pane A's minimap then sits mid-viewport, under the centered picker.
    await win.keyboard.press('Control+Backslash')
    await expect(win.locator('#paneB')).toBeVisible()

    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Paste from History')
    await win.keyboard.press('Enter')
    await expect(win.locator('.ph-picker')).toBeVisible()

    // No point across the picker list may be occluded by a non-picker (Monaco) element.
    const occluders = await win.evaluate(() => {
      const list = document.querySelector('.ph-list') as HTMLElement
      const r = list.getBoundingClientRect()
      const found: string[] = []
      for (let x = r.left + 4; x < r.right - 4; x += 24) {
        for (let y = r.top + 4; y < r.bottom - 4; y += 12) {
          const el = document.elementFromPoint(Math.round(x), Math.round(y))
          if (el && !el.closest('.ph-picker')) found.push(el.tagName)
        }
      }
      return found
    })
    expect(occluders).toEqual([])
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('editor clips to its pane and word-wraps long lines', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Pane clips its editor so content can't bleed under the neighbour pane.
    const overflow = await win.evaluate(() => getComputedStyle(document.querySelector('#paneA')!).overflow)
    expect(overflow).toBe('hidden')

    // Type one long logical line; with word wrap on it renders as multiple visual lines.
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.type('lorem ipsum dolor sit amet '.repeat(40))
    await win.waitForTimeout(200)
    const visualLines = await win.locator('#paneA .view-line').count()
    expect(visualLines).toBeGreaterThan(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('split gutter drag resizes the panes', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Toggle Split via palette, then the gutter should exist
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Split')
    await win.keyboard.press('Enter')
    await expect(win.locator('#paneB')).toBeVisible()
    const gutter = win.locator('.gutter')
    await expect(gutter).toBeVisible()

    // Measure pane A, drag the gutter right ~150px, expect pane A to widen
    const before = (await win.locator('#paneA').boundingBox())!.width
    const g = (await gutter.boundingBox())!
    await win.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await win.mouse.down()
    await win.mouse.move(g.x + 150, g.y + g.height / 2, { steps: 12 })
    await win.mouse.up()
    const after = (await win.locator('#paneA').boundingBox())!.width
    expect(after).toBeGreaterThan(before + 80)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('snippets save/insert/manage and always-on-top toggle', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Manage Snippets -> overlay opens; add a snippet via the manager
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Manage Snippets')
    await win.keyboard.press('Enter')
    await expect(win.locator('.snip-mgr')).toBeVisible()
    await win.locator('.snip-mgr-head button', { hasText: '+ Add' }).click()
    await expect(win.locator('.snip-mgr-row')).toHaveCount(1)
    await win.keyboard.press('Escape')

    // Insert Snippet -> picker opens
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Insert Snippet')
    await win.keyboard.press('Enter')
    await expect(win.locator('.snip-picker')).toBeVisible()
    await win.keyboard.press('Escape')

    // Always on top -> reflected in the window state
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Always on Top')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(100)
    const onTop = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())
    expect(onTop).toBe(true)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
