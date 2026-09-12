import type { ElectronApplication, Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'

interface WriteSnapshot {
  content: string
  eol: string
  encoding: string
  revision: number
}

async function chooseFileCommand(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, commandLabel) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === commandLabel)!.click()
  }, label)
}

async function writeSnapshots(win: Page): Promise<WriteSnapshot[]> {
  return win.evaluate(() => JSON.parse(document.body.dataset.saveWriteSnapshots ?? '[]') as WriteSnapshot[])
}

test('a queued save writes the latest content and format after an in-flight write settles', async ({ smoke }) => {
  test.setTimeout(60000)
  const userDataDir = smoke.tempDir('notes-save-race-')
  const filePath = join(userDataDir, 'race.txt')
  writeFileSync(filePath, 'on disk')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: { ...process.env, NC_HEADLESS: '1', NC_TEST_FILE_WRITE_DELAY_MS: '1000' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('#paneA .view-lines')).toContainText('on disk')

  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('first save')
  await expect(win.locator('.sb-state')).toHaveText('● unsaved')
  await chooseFileCommand(app, 'Save')
  await expect(win.locator('body')).toHaveAttribute('data-save-write-state', 'active')
  await expect.poll(() => writeSnapshots(win)).toHaveLength(1)

  await editor.click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('newer save')
  await win.getByLabel('File encoding').selectOption('utf16le')
  await win.getByLabel('Line endings').selectOption('CRLF')
  await chooseFileCommand(app, 'Save')

  await expect.poll(() => writeSnapshots(win)).toHaveLength(2)
  const writes = await writeSnapshots(win)
  expect(writes.map(({ content, eol, encoding }) => ({ content, eol, encoding }))).toEqual([
    { content: 'first save', eol: 'LF', encoding: 'utf8' },
    { content: 'newer save', eol: 'CRLF', encoding: 'utf16le' },
  ])
  expect(writes[1].revision).toBeGreaterThan(writes[0].revision)
  await expect.poll(() => win.evaluate(() => ({
    state: document.body.dataset.saveWriteState,
    completions: document.body.dataset.saveWriteCompletionCount,
    dirty: document.body.dataset.saveWriteLastCompletionDirty,
  }))).toEqual({ state: 'active', completions: '1', dirty: 'true' })

  await expect.poll(() => {
    const bytes = readFileSync(filePath)
    return { bom: [...bytes.subarray(0, 2)], content: bytes.subarray(2).toString('utf16le') }
  }).toEqual({ bom: [0xff, 0xfe], content: 'newer save' })
  await expect(win.locator('body')).toHaveAttribute('data-save-write-last-completion-dirty', 'false')
  await expect(win.locator('.sb-state')).toHaveText('● saved')
})
