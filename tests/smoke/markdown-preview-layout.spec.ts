import type { Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { openSettings } from './settingsHelper'
import { waitForBoot } from './appReady'

async function runCommand(win: Page, label: string): Promise<void> {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

async function chooseToolbarMode(win: Page, label: 'Side by side' | 'Focus' | 'Off'): Promise<void> {
  await win.getByRole('button', { name: 'Choose Markdown preview mode' }).click()
  await win.getByRole('menuitemradio', { name: label }).click()
}

async function expectMode(win: Page, mode: 'off' | 'side-by-side' | 'focus'): Promise<void> {
  await expect(win.locator('#panes')).toHaveAttribute('data-markdown-preview-mode', mode)
}

function settings(userDataDir: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function dragPreviewGutter(win: Page, deltaX: number): Promise<void> {
  const gutter = win.locator('.markdown-preview-gutter')
  const box = await gutter.boundingBox()
  if (!box) throw new Error('Markdown preview gutter has no bounding box')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const viewportWidth = await win.evaluate(() => window.innerWidth)
  await win.mouse.move(x, y)
  await win.mouse.down()
  await win.mouse.move(Math.max(0, Math.min(viewportWidth - 1, x + deltaX)), y, { steps: 8 })
  await win.mouse.up()
}

async function expectBothSurfacesAtLeast160(win: Page): Promise<void> {
  const [editor, preview] = await Promise.all([
    win.locator('#editor-group').boundingBox(),
    win.locator('#mdpreview').boundingBox(),
  ])
  expect(editor?.width).toBeGreaterThanOrEqual(160)
  expect(preview?.width).toBeGreaterThanOrEqual(160)
}

async function livePreviewWidthPercent(win: Page): Promise<number> {
  const [root, gutter] = await Promise.all([
    win.locator('#panes').boundingBox(),
    win.locator('.markdown-preview-gutter').boundingBox(),
  ])
  if (!root || !gutter) throw new Error('Markdown preview layout has no bounding boxes')
  const gutterCentre = gutter.x + gutter.width / 2
  return (root.x + root.width - gutterCentre) / root.width * 100
}

async function quickOpen(win: Page, fileName: string): Promise<void> {
  await win.keyboard.press('Control+p')
  const input = win.getByRole('combobox', { name: 'Quick Open' })
  await input.fill(fileName)
  await expect(win.locator('.qo-row').first()).toContainText(fileName)
  await input.press('Enter')
}

test('Markdown preview keeps the nested A/B split resizable and persists the outer width', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'nested.md')
  writeFileSync(markdownPath, `# Nested layout\n\n${'A long preview paragraph.\n\n'.repeat(100)}`)
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  await chooseToolbarMode(win, 'Side by side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Nested layout')
  await expect(win.locator('.markdown-preview-gutter')).toHaveCount(1)

  const preview = win.locator('#mdpreview')
  const retainedScroll = await preview.evaluate(panel => {
    const state = window as typeof window & { __retainedPreviewNode?: Element | null }
    state.__retainedPreviewNode = panel.firstElementChild
    panel.scrollTop = 120
    return panel.scrollTop
  })
  expect(retainedScroll).toBeGreaterThan(0)
  await chooseToolbarMode(win, 'Side by side')
  expect(await preview.evaluate(panel => {
    const state = window as typeof window & { __retainedPreviewNode?: Element | null }
    return panel.firstElementChild === state.__retainedPreviewNode
  })).toBe(true)
  expect(await preview.evaluate(panel => panel.scrollTop)).toBe(retainedScroll)

  const editorGroup = win.locator('#editor-group')
  await expect(editorGroup.locator('#paneA')).toHaveCount(1)
  await expect(editorGroup.locator('#paneB')).toHaveCount(1)
  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  await expect(editorGroup.locator('#paneA')).toBeVisible()
  await expect(editorGroup.locator('#paneB')).toBeVisible()
  await expect(win.locator('.markdown-preview-gutter')).toHaveCount(1)

  await dragPreviewGutter(win, -2_000)
  await expectBothSurfacesAtLeast160(win)
  await dragPreviewGutter(win, 2_000)
  await expectBothSurfacesAtLeast160(win)
  await expect.poll(() => Number(settings(userDataDir).markdownPreviewWidthPercent)).not.toBe(50)
  await expect.poll(() => Number.isInteger(Number(settings(userDataDir).markdownPreviewWidthPercent))).toBe(true)
})

test('Markdown preview separator reclamps after window and sidebar resizes', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'keyboard.md')
  writeFileSync(markdownPath, '# Keyboard layout')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)
  await win.setViewportSize({ width: 900, height: 600 })

  await chooseToolbarMode(win, 'Side by side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Keyboard layout')
  const gutter = win.getByRole('separator', { name: 'Resize Markdown preview' })
  await expect(gutter).toHaveAttribute('aria-orientation', 'vertical')
  await expect(gutter).toHaveAttribute('aria-valuemin', /\d+/)
  await expect(gutter).toHaveAttribute('aria-valuemax', /\d+/)
  await expect(gutter).toHaveAttribute('aria-valuenow', /\d+/)
  const initial = Number(await gutter.getAttribute('aria-valuenow'))
  const maximum = Number(await gutter.getAttribute('aria-valuemax'))

  await gutter.focus()
  await gutter.press('ArrowLeft')
  await expect(gutter).toHaveAttribute('aria-valuenow', String(Math.min(initial + 5, maximum)))
  await gutter.press('Home')
  await expect(gutter).toHaveAttribute('aria-valuenow', await gutter.getAttribute('aria-valuemin') ?? '')
  await expectBothSurfacesAtLeast160(win)
  await gutter.press('End')
  await expect(gutter).toHaveAttribute('aria-valuenow', await gutter.getAttribute('aria-valuemax') ?? '')
  await expectBothSurfacesAtLeast160(win)

  await win.setViewportSize({ width: 520, height: 600 })
  await expect.poll(async () => Number(await gutter.getAttribute('aria-valuemax'))).toBeLessThan(80)
  await expect(gutter).toHaveAttribute('aria-valuenow', await gutter.getAttribute('aria-valuemax') ?? '')
  await expectBothSurfacesAtLeast160(win)

  await win.setViewportSize({ width: 900, height: 600 })
  await gutter.press('End')
  await win.locator('.sb-toggle').click()
  await expect(win.locator('#sidebar')).toBeVisible()
  await expect.poll(async () => Number(await gutter.getAttribute('aria-valuemax'))).toBeLessThan(80)
  await expect(gutter).toHaveAttribute('aria-valuenow', await gutter.getAttribute('aria-valuemax') ?? '')
  await expectBothSurfacesAtLeast160(win)
})

test('Markdown preview Focus keeps preview focus across mouse and keyboard Markdown tab activation', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    markdownPreviewMode: 'focus',
    markdownPreviewLastVisibleMode: 'focus',
  }))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'a', title: 'a.md', filePath: null, content: '# Preview A', language: 'markdown', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'b', title: 'b.md', filePath: null, content: '# Preview B', language: 'markdown', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'a',
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)
  const preview = win.locator('#mdpreview')

  await win.getByRole('tab', { name: 'b.md' }).click()
  await expect(preview.locator('h1')).toHaveText('Preview B')
  await expect(preview).toBeFocused()

  await win.getByRole('tab', { name: 'b.md' }).focus()
  await win.keyboard.press('ArrowLeft')
  await expect(preview.locator('h1')).toHaveText('Preview A')
  await expect(preview).toBeFocused()

  await win.keyboard.press('Control+PageDown')
  await expect(preview.locator('h1')).toHaveText('Preview B')
  await expect(preview).toBeFocused()
})

test('Markdown preview Focus returns focus to pane B when switched Off', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'focus-return.md')
  writeFileSync(markdownPath, '# Focus return')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  const paneBInput = win.locator('#paneB textarea.inputarea')
  await paneBInput.focus()
  await expect(paneBInput).toBeFocused()
  await chooseToolbarMode(win, 'Focus')
  await expectMode(win, 'focus')
  await expect(win.locator('#editor-group')).toBeHidden()
  await expect(win.locator('#mdpreview')).toBeVisible()
  await expect(win.locator('#mdpreview')).toBeFocused()

  await chooseToolbarMode(win, 'Off')
  await expectMode(win, 'off')
  await expect(paneBInput).toBeFocused()
})

test('Markdown preview restart restoration reapplies Focus and a saved side-by-side width', async ({ smoke }) => {
  test.setTimeout(60_000)
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'restart.md')
  writeFileSync(markdownPath, '# Restart restoration')

  let app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  let win = await app.firstWindow()
  await waitForBoot(win)
  await chooseToolbarMode(win, 'Focus')
  await expectMode(win, 'focus')
  await expect.poll(() => settings(userDataDir).markdownPreviewMode).toBe('focus')
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  win = await app.firstWindow()
  await waitForBoot(win)
  await expectMode(win, 'focus')
  await expect(win.locator('#editor-group')).toBeHidden()
  await expect(win.locator('#mdpreview h1')).toHaveText('Restart restoration')

  await chooseToolbarMode(win, 'Side by side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Restart restoration')
  await dragPreviewGutter(win, -110)
  const draggedWidth = await livePreviewWidthPercent(win)
  expect(Math.abs(draggedWidth - 50)).toBeGreaterThan(5)
  await expect.poll(() =>
    Math.abs(Number(settings(userDataDir).markdownPreviewWidthPercent) - draggedWidth)
  ).toBeLessThanOrEqual(2)
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  win = await app.firstWindow()
  await waitForBoot(win)
  await expectMode(win, 'side-by-side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Restart restoration')
  const restoredWidth = await livePreviewWidthPercent(win)
  expect(Math.abs(restoredWidth - draggedWidth)).toBeLessThanOrEqual(2)
})

test('Markdown preview temporarily shows the editor for plain text and returns to Focus for Markdown', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'note.md')
  const codePath = join(userDataDir, 'code.ts')
  writeFileSync(markdownPath, '# Markdown returns')
  writeFileSync(codePath, 'const answer = 42')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: userDataDir,
    sidebarVisible: true,
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  await chooseToolbarMode(win, 'Focus')
  await expectMode(win, 'focus')
  await quickOpen(win, 'code.ts')
  await expectMode(win, 'off')
  await expect(win.locator('#editor-group')).toBeVisible()
  await expect(win.locator('#mdpreview')).toBeHidden()
  await expect.poll(() => settings(userDataDir).markdownPreviewMode).toBe('focus')

  await quickOpen(win, 'note.md')
  await expectMode(win, 'focus')
  await expect(win.locator('#editor-group')).toBeHidden()
  await expect(win.locator('#mdpreview h1')).toHaveText('Markdown returns')
})

test('Markdown preview Remember opt-out keeps relaunches Off until it is re-enabled', async ({ smoke }) => {
  test.setTimeout(90_000)
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'remember.md')
  writeFileSync(markdownPath, '# Remember opt-out')

  let app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  let win = await app.firstWindow()
  await waitForBoot(win)
  await chooseToolbarMode(win, 'Focus')
  await expectMode(win, 'focus')
  await openSettings(win, 'Editor')
  await win.getByLabel('Remember Markdown preview mode').uncheck()
  await expect.poll(() => settings(userDataDir).rememberMarkdownPreviewMode).toBe(false)
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  win = await app.firstWindow()
  await waitForBoot(win)
  await expectMode(win, 'off')
  await expect(win.locator('#editor-group')).toBeVisible()
  await expect(win.locator('#mdpreview')).toBeHidden()
  await chooseToolbarMode(win, 'Side by side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Remember opt-out')
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  win = await app.firstWindow()
  await waitForBoot(win)
  await expectMode(win, 'off')
  await openSettings(win, 'Editor')
  await win.getByLabel('Remember Markdown preview mode').check()
  await expect.poll(() => settings(userDataDir).rememberMarkdownPreviewMode).toBe(true)
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await chooseToolbarMode(win, 'Focus')
  await expectMode(win, 'focus')
  await expect.poll(() => settings(userDataDir).markdownPreviewMode).toBe('focus')
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  win = await app.firstWindow()
  await waitForBoot(win)
  await expectMode(win, 'focus')
  await expect(win.locator('#mdpreview h1')).toHaveText('Remember opt-out')
})

test('Markdown preview controls, commands, and unavailable toggle keep one saved preference', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-preview-layout-')
  const markdownPath = join(userDataDir, 'controls.md')
  const codePath = join(userDataDir, 'controls.ts')
  writeFileSync(markdownPath, '# Controls')
  writeFileSync(codePath, 'export const controls = true')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: userDataDir,
    sidebarVisible: true,
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, markdownPath],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  for (const [label, mode] of [
    ['Side by side', 'side-by-side'],
    ['Focus', 'focus'],
    ['Off', 'off'],
  ] as const) {
    await chooseToolbarMode(win, label)
    await expectMode(win, mode)
    await win.getByRole('button', { name: 'Choose Markdown preview mode' }).click()
    await expect(win.getByRole('menuitemradio')).toHaveCount(3)
    for (const [radioLabel, radioMode] of [
      ['Side by side', 'side-by-side'],
      ['Focus', 'focus'],
      ['Off', 'off'],
    ] as const) {
      await expect(win.getByRole('menuitemradio', { name: radioLabel }))
        .toHaveAttribute('aria-checked', String(radioMode === mode))
    }
    const selected = win.getByRole('menuitemradio', { name: label })
    await expect(selected.locator('.ctx-check')).toBeVisible()
    await expect(selected.locator('.ctx-check')).toHaveText('✓')
    expect(await selected.locator('.ctx-check').evaluate(marker =>
      getComputedStyle(marker).color === getComputedStyle(marker.parentElement!).color
    )).toBe(true)
    expect(await win.getByRole('menuitemradio').evaluateAll(rows =>
      rows.every(row => (row.querySelector('.ctx-check')?.getBoundingClientRect().width ?? 0) > 0)
    )).toBe(true)
    await win.keyboard.press('Escape')
  }

  await chooseToolbarMode(win, 'Focus')
  const toggle = win.locator('[data-toolbar="markdown-preview-toggle"]')
  await toggle.click()
  await expectMode(win, 'off')
  await toggle.click()
  await expectMode(win, 'focus')

  await runCommand(win, 'Markdown Preview: Off')
  await expectMode(win, 'off')
  await runCommand(win, 'Markdown Preview: Side by side')
  await expectMode(win, 'side-by-side')
  await runCommand(win, 'Markdown Preview: Focus')
  await expectMode(win, 'focus')
  await runCommand(win, 'Markdown Preview: Side by side')
  await expectMode(win, 'side-by-side')
  await expect.poll(() => settings(userDataDir).markdownPreviewMode).toBe('side-by-side')

  await quickOpen(win, 'controls.ts')
  await expectMode(win, 'off')
  await expect(toggle).toBeDisabled()
  const chooser = win.locator('.tb-preview-wrap .tb-caret')
  const unavailable = 'Markdown preview is unavailable for non-Markdown files'
  await expect(chooser).toBeDisabled()
  await expect(toggle).toHaveAttribute('title', unavailable)
  await expect(toggle).toHaveAttribute('aria-label', unavailable)
  await expect(chooser).toHaveAttribute('title', unavailable)
  await expect(chooser).toHaveAttribute('aria-label', unavailable)
  await runCommand(win, 'Markdown Preview: Focus')
  const toasts = win.locator('#toast-host .toast')
  await expect(toasts).toHaveCount(1)
  await expect(toasts.first()).toContainText('Markdown Preview is available for Markdown files.')
  await expectMode(win, 'off')
  await expect(toasts).toHaveCount(0)

  await runCommand(win, 'Toggle Markdown Preview')
  await expect(toasts).toHaveCount(1)
  await expect(toasts.first()).toContainText('Markdown Preview is available for Markdown files.')
  await expectMode(win, 'off')
  await quickOpen(win, 'controls.md')
  await expectMode(win, 'side-by-side')
  await expect(win.locator('#mdpreview h1')).toHaveText('Controls')
})
