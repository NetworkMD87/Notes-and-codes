import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const UGLY_JS = 'const   x=1\nfunction  f( ){return   x}'

async function runCmd(win: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>, label: string) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

test('Format Selection formats a non-empty selection', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fmtsel-'))
  const filePath = join(userDataDir, 'ugly.js')
  writeFileSync(filePath, UGLY_JS)
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('const')
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A')   // non-empty selection → exercises the range-format branch
    await runCmd(win, 'Format Selection')
    await expect(win.locator('#paneA .view-lines')).toContainText('const x = 1;')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Format Document no-ops on an unsupported language (plaintext) with a toast', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fmtunsup-'))
  const filePath = join(userDataDir, 'note.txt')   // .txt → plaintext, unsupported
  writeFileSync(filePath, UGLY_JS)
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('const')
    await runCmd(win, 'Format Document')
    await expect(win.locator('#toast-host .toast')).toContainText("isn't supported")
    // No reformat happened: the prettier-canonical form never appears.
    await expect(win.locator('#paneA .view-lines')).not.toContainText('const x = 1;')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Format Document leaves the buffer untouched on a syntax error, with a toast', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fmtbad-'))
  const filePath = join(userDataDir, 'bad.js')
  writeFileSync(filePath, 'const x = (')   // invalid JS → prettier throws
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('const x = (')
    await runCmd(win, 'Format Document')
    await expect(win.locator('#toast-host .toast')).toContainText('Format failed')
    await expect(win.locator('#paneA .view-lines')).toContainText('const x = (')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Format commands are wired into the Edit menu with the Shift+Alt+F accelerator', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fmtmenu-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const edit = await app.evaluate(({ Menu }) => {
      const editMenu = Menu.getApplicationMenu()!.items.find(i => i.label === 'Edit')!
      return editMenu.submenu!.items.map(i => ({ label: i.label, accelerator: i.accelerator }))
    })
    const fmtDoc = edit.find(i => i.label === 'Format Document')
    const fmtSel = edit.find(i => i.label === 'Format Selection')
    expect(fmtDoc).toBeTruthy()
    expect(fmtSel).toBeTruthy()
    // Accelerator registered → Electron fires 'format-doc' on the real Shift+Alt+F press.
    expect(fmtDoc!.accelerator).toBe('Shift+Alt+F')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
