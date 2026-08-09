import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { test, expect } from './smokeTest'

interface StoredBuffer {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: 'LF' | 'CRLF'
  encoding: 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'
  dirty: boolean
  highlights?: Array<{ start: number; end: number; colour: string }>
}

function seedSession(userDataDir: string, buffers: StoredBuffer[], activeId: string): string {
  const sessionPath = join(userDataDir, 'session', 'session.json')
  mkdirSync(join(userDataDir, 'session'), { recursive: true })
  writeFileSync(sessionPath, JSON.stringify({ buffers, activeId }))
  return sessionPath
}

function savedBuffer(sessionPath: string, id: string): StoredBuffer | undefined {
  const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as { buffers: StoredBuffer[] }
  return session.buffers.find(buffer => buffer.id === id)
}

async function chooseFileCommand(
  app: ElectronApplication,
  label: string,
): Promise<void> {
  await app.evaluate(({ Menu }, commandLabel) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === commandLabel)!.click()
  }, label)
}

test('overlapping session saves restore only the newest snapshot', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-sessionlatest-')
  const filePath = join(userDataDir, 'session-note.txt')
  writeFileSync(filePath, '')
  const env = { ...process.env, NC_TEST_SESSION_SAVE_DELAY_MS: '1000' }
  const app1 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env,
  })
  const win1 = await app1.firstWindow()
  await expect(win1.locator('body[data-booted="true"]')).toBeVisible()
  const editor = win1.locator('#paneA .monaco-editor')
  await editor.click()
  await win1.keyboard.type('old')
  await expect(win1.locator('body')).toHaveAttribute('data-session-write-state', 'active')
  await win1.keyboard.insertText('-newest')
  await expect(win1.locator('body')).toHaveAttribute('data-session-write-state', 'active-pending')
  const editRevision = Number(await win1.locator('body').getAttribute('data-session-write-revision'))
  await win1.keyboard.press('Control+Shift+P')
  await win1.locator('#palette input').fill('Save')
  await win1.keyboard.press('Enter')
  await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('old-newest')
  await expect(win1.locator('.sb-state')).toHaveText('● saved')
  await expect.poll(async () => Number(await win1.locator('body').getAttribute('data-session-write-revision')))
    .toBeGreaterThan(editRevision)
  const closed = app1.waitForEvent('close')
  await app1.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === 'Exit')!.click()
  }).catch(() => {})
  await closed

  // Session restore uses the persisted snapshot rather than re-reading this path. Replacing
  // the file makes the assertion below discriminate session state from an ordinary disk open.
  writeFileSync(filePath, 'disk-decoy')
  const app2 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win2.locator('#paneA .view-lines')).toContainText('old-newest')
})

test('background format mutation reaches session when the file write rejects', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-session-format-reject-')
  const filePath = join(userDataDir, 'background.ts')
  const ugly = 'const   x=1\nfunction  f( ){return   x}'
  writeFileSync(filePath, ugly)
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ formatOnSave: true }))
  const sessionPath = seedSession(userDataDir, [
    {
      id: 'background', title: 'background.ts', filePath, content: ugly,
      language: 'typescript', eol: 'LF', encoding: 'utf8', dirty: true,
    },
    {
      id: 'active', title: 'Active', filePath: null, content: 'leave me active',
      language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false,
    },
  ], 'active')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_FAIL_FILE_WRITE: '1' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  await chooseFileCommand(app, 'Save All')
  await expect(win.locator('.toast')).toContainText('1 failed')
  await expect.poll(() => savedBuffer(sessionPath, 'background')).toMatchObject({
    content: 'const x = 1;\nfunction f() {\n  return x;\n}\n',
    dirty: true,
  })
  expect(readFileSync(filePath, 'utf8')).toBe(ugly)
})

test('markSaved reaches session when highlight persistence rejects', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-session-highlight-reject-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'old disk')
  const sessionPath = seedSession(userDataDir, [{
    id: 'note', title: 'note.txt', filePath, content: 'new disk',
    language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: true,
    highlights: [{ start: 0, end: 3, colour: 'yellow' }],
  }], 'note')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_FAIL_HIGHLIGHT_SAVE: '1' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  await chooseFileCommand(app, 'Save')
  await expect(win.locator('.toast')).toContainText('Save failed')
  await expect.poll(() => savedBuffer(sessionPath, 'note')).toMatchObject({
    filePath,
    content: 'new disk',
    dirty: false,
  })
  expect(readFileSync(filePath, 'utf8')).toBe('new disk')
})

test('successful highlight migration removes embedded highlights from the newest session', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-session-highlight-migrate-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'old disk')
  const sessionPath = seedSession(userDataDir, [{
    id: 'note', title: 'note.txt', filePath, content: 'new disk',
    language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: true,
    highlights: [{ start: 0, end: 3, colour: 'yellow' }],
  }], 'note')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  await chooseFileCommand(app, 'Save')
  await expect(win.locator('.sb-state')).toHaveText('● saved')
  await expect.poll(() => savedBuffer(sessionPath, 'note')?.highlights).toBeUndefined()
})
