import type { ElectronApplication, Page } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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

async function releaseWrite(win: Page, index: number): Promise<void> {
  await expect(win.locator('body')).toHaveAttribute('data-save-write-held-index', String(index))
  await win.evaluate(writeIndex => {
    document.dispatchEvent(new CustomEvent('nc-test-release-save-write', { detail: writeIndex }))
  }, index)
}

async function openExternal(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ BrowserWindow }, filePath) => {
    BrowserWindow.getAllWindows()[0].webContents.send('open-file', filePath)
  }, path)
}

test('a queued save writes the latest content and format after an in-flight write settles', async ({ smoke }) => {
  test.setTimeout(60000)
  const userDataDir = smoke.tempDir('notes-save-race-')
  const filePath = join(userDataDir, 'race.txt')
  writeFileSync(filePath, 'on disk')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: { ...process.env, NC_HEADLESS: '1' },
  })
  const win = await app.firstWindow()
  win.on('console', message => {
    if (message.type() === 'error' && message.text().startsWith('save failed')) {
      console.error('[queued-save renderer]', message.text())
    }
  })
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('#paneA .view-lines')).toContainText('on disk')
  await win.evaluate(() => { document.body.dataset.saveWriteControlled = 'true' })

  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('first save')
  await expect(win.locator('.sb-state')).toHaveText('● unsaved')
  await chooseFileCommand(app, 'Save')
  await expect(win.locator('body')).toHaveAttribute('data-save-write-held-index', '1')
  await expect(win.locator('body')).toHaveAttribute('data-save-write-state', 'active')
  await expect.poll(() => writeSnapshots(win)).toHaveLength(1)

  await editor.click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('newer\nsave')
  await win.getByLabel('File encoding').selectOption('utf16le')
  await win.getByLabel('Line endings').selectOption('CRLF')
  await chooseFileCommand(app, 'Save')

  // Acknowledge the second request while the first is held: it must queue, not write.
  await expect(win.locator('body')).toHaveAttribute('data-save-write-request-count', '2')
  expect(await writeSnapshots(win)).toHaveLength(1)
  await expect(win.locator('body')).not.toHaveAttribute('data-save-write-completion-count')
  await releaseWrite(win, 1)

  await expect(win.locator('body')).toHaveAttribute('data-save-write-held-index', '2')
  await expect.poll(() => writeSnapshots(win)).toHaveLength(2)
  const writes = await writeSnapshots(win)
  expect(writes.map(({ content, eol, encoding }) => ({ content, eol, encoding }))).toEqual([
    { content: 'first save', eol: 'LF', encoding: 'utf8' },
    { content: 'newer\r\nsave', eol: 'CRLF', encoding: 'utf16le' },
  ])
  expect(writes[1].revision).toBeGreaterThan(writes[0].revision)
  await expect.poll(() => win.evaluate(() => ({
    state: document.body.dataset.saveWriteState,
    completions: document.body.dataset.saveWriteCompletionCount,
    dirty: document.body.dataset.saveWriteLastCompletionDirty,
  }))).toEqual({ state: 'active', completions: '1', dirty: 'true' })
  await expect.poll(() => win.evaluate(() => JSON.parse(document.body.dataset.saveWriteCompletions ?? '[]')))
    .toEqual([{ revision: writes[0].revision, dirty: true }])
  await releaseWrite(win, 2)

  // Confirm the queued write completed before opening the target on Windows. Reading it
  // while atomic replacement is in flight adds file access that the scenario does not need.
  await expect(win.locator('body')).toHaveAttribute('data-save-write-completion-count', '2')
  await expect(win.locator('body')).toHaveAttribute('data-save-write-last-completion-dirty', 'false')
  await expect(win.locator('body')).toHaveAttribute('data-save-write-state', 'settled')
  await expect.poll(() => win.evaluate(() => JSON.parse(document.body.dataset.saveWriteCompletions ?? '[]')))
    .toEqual([{ revision: writes[0].revision, dirty: true }, { revision: writes[1].revision, dirty: false }])
  await expect(win.locator('.sb-state')).toHaveText('● saved')
  const bytes = readFileSync(filePath)
  expect({ bom: [...bytes.subarray(0, 2)], content: bytes.subarray(2).toString('utf16le') })
    .toEqual({ bom: [0xff, 0xfe], content: 'newer\r\nsave' })
})

test('Save As keeps the originating buffer when an external open rebinds its pane during the dialog', async ({ smoke }) => {
  test.setTimeout(60000)
  const userDataDir = smoke.tempDir('notes-save-as-owner-')
  const targetPath = join(userDataDir, 'owner.txt')
  const externalPath = join(userDataDir, 'external.txt')
  writeFileSync(externalPath, 'external buffer')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NC_HEADLESS: '1',
      NC_TEST_SAVE_AS_DELAY_MS: '1000',
      NC_TEST_SAVE_AS_PATHS: JSON.stringify([targetPath]),
    },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.type('origin buffer')
  await chooseFileCommand(app, 'Save As…')
  await expect(win.locator('body')).toHaveAttribute('data-save-as-state', 'active')

  await openExternal(app, externalPath)
  await expect(win.locator('#paneA .view-lines')).toContainText('external buffer')
  await expect.poll(() => existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : null).toBe('origin buffer')
})
