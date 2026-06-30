import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TEXT = 'hello world foo bar baz'

async function runCmd(win: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>, label: string) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

async function dragPaint(win: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) {
  const line = win.locator('#paneA .view-lines')
  const box = await line.boundingBox()
  if (!box) throw new Error('no editor box')
  const y = box.y + 8
  await win.mouse.move(box.x + 4, y)
  await win.mouse.down()
  await win.mouse.move(box.x + 70, y, { steps: 8 })
  await win.mouse.up()
}

test('highlighter paints a decoration and Clear removes it', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-hl-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win, 'Toggle Highlighter')
    await dragPaint(win)
    await expect(win.locator('#paneA .hl-yellow').first()).toBeVisible()
    await runCmd(win, 'Clear Highlights')
    await expect(win.locator('#paneA .hl-yellow')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('highlights persist across a relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-hl2-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)

  const app1 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win1 = await app1.firstWindow()
    await expect(win1.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win1, 'Toggle Highlighter')
    await dragPaint(win1)
    await expect(win1.locator('#paneA .hl-yellow').first()).toBeVisible()
    await win1.waitForTimeout(800) // let the ~600ms debounced save flush
  } finally {
    await app1.close()
  }

  const app2 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win2 = await app2.firstWindow()
    await expect(win2.locator('#paneA .hl-yellow').first()).toBeVisible()
  } finally {
    await app2.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
