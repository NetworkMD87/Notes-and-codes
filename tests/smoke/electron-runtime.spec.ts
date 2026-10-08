import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'

// Optional isolated QA executable; every launch still owns a fresh temporary profile.
const executablePath = process.env.NC_RUNTIME_EXECUTABLE
const entryArgs = executablePath ? [] : ['out/main/index.js']

test('the running Electron matches the lockfile and keeps the renderer sandboxed', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-runtime-')
  const app = await smoke.launch({ executablePath, args: [...entryArgs, `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  const expected = JSON.parse(readFileSync('package-lock.json', 'utf8')).packages['node_modules/electron'].version
  const runtime = await app.evaluate(({ BrowserWindow, app }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return {
      version: process.versions.electron,
      packaged: app.isPackaged,
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
    }
  })
  expect(runtime).toEqual({ version: expected, packaged: !!executablePath, sandbox: true, contextIsolation: true, nodeIntegration: false })
  expect(await win.evaluate(() => typeof (globalThis as unknown as { require?: unknown }).require)).toBe('undefined')
  // Exercise the clipboard IPC without reading or changing the user's actual clipboard.
  await app.evaluate(({ clipboard }) => { clipboard.readText = () => 'runtime clipboard fixture' })
  expect(await win.evaluate(() => window.api.clipboardRead())).toBe('runtime clipboard fixture')
})

test('Open, Save As and folder dialogs remember independent directories after restart', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-dialog-memory-')
  const root = smoke.tempDir('notes-dialog-files-')
  const openDir = join(root, 'opened')
  const saveDir = join(root, 'saved')
  const folderDir = join(root, 'folder')
  for (const dir of [openDir, saveDir, folderDir]) mkdirSync(dir)
  const openPath = join(openDir, 'input.txt')
  const savePath = join(saveDir, 'output.txt')
  writeFileSync(openPath, 'input')

  const app = await smoke.launch({ executablePath, args: [...entryArgs, `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  // Replace only the OS picker. Calls still cross the real preload/IPC and persistence path.
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async (options: Electron.OpenDialogOptions) => ({
      canceled: false,
      filePaths: [options.properties?.includes('openDirectory') ? paths.folderDir : paths.openPath],
    })) as typeof dialog.showOpenDialog
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: paths.savePath })) as typeof dialog.showSaveDialog
  }, { folderDir, openPath, savePath })
  expect(await win.evaluate(() => window.api.openDialog())).toBe(openPath)
  expect(await win.evaluate(() => window.api.saveAsDialog())).toBe(savePath)
  expect(await win.evaluate(() => window.api.openFolderDialog())).toBe(folderDir)
  await app.close()

  const reopened = await smoke.launch({ executablePath, args: [...entryArgs, `--user-data-dir=${userDataDir}`] })
  const restored = await reopened.firstWindow()
  await waitForBoot(restored)
  await reopened.evaluate(({ dialog }) => {
    const captured: string[] = []
    ;(globalThis as unknown as { dialogPaths: string[] }).dialogPaths = captured
    dialog.showOpenDialog = (async (options: Electron.OpenDialogOptions) => {
      captured.push(options.defaultPath ?? '')
      return { canceled: true, filePaths: [] }
    }) as typeof dialog.showOpenDialog
    dialog.showSaveDialog = (async (options: Electron.SaveDialogOptions) => {
      captured.push(options.defaultPath ?? '')
      return { canceled: true, filePath: '' }
    }) as typeof dialog.showSaveDialog
  })
  expect(await restored.evaluate(() => window.api.openDialog())).toBeNull()
  expect(await restored.evaluate(() => window.api.saveAsDialog())).toBeNull()
  expect(await restored.evaluate(() => window.api.openFolderDialog())).toBeNull()
  expect(await reopened.evaluate(() => (globalThis as unknown as { dialogPaths: string[] }).dialogPaths))
    .toEqual([openDir, saveDir, folderDir])
})

test('Markdown HTML and PDF exports use the real renderer and printing pipeline', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-runtime-export-')
  const root = smoke.tempDir('notes-runtime-documents-')
  const source = join(root, 'document.md')
  const htmlPath = join(root, 'document.html')
  const pdfPath = join(root, 'document.pdf')
  writeFileSync(source, '# Runtime export\n\nContact a@b.co\n\n- [x] completed')
  const app = await smoke.launch({ executablePath, args: [...entryArgs, `--user-data-dir=${userDataDir}`, source] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  await expect(win.locator('#paneA .view-lines')).toContainText('Runtime export')
  await app.evaluate(({ dialog }, paths) => {
    const outputs = [paths.htmlPath, paths.pdfPath]
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: outputs.shift()! })) as typeof dialog.showSaveDialog
  }, { htmlPath, pdfPath })

  for (const format of ['html', 'pdf']) {
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill(`Export to ${format.toUpperCase()}`)
    await win.keyboard.press('Enter')
    await expect(win.locator('.toast--success').filter({ hasText: `Exported document.${format}.` })).toBeVisible()
  }
  expect(existsSync(htmlPath)).toBe(true)
  const html = readFileSync(htmlPath, 'utf8')
  expect(html).toContain('<h1>Runtime export</h1>')
  expect(html).toContain('mailto:a@b.co')
  expect(html).toContain("default-src 'none'; img-src data:; style-src 'unsafe-inline'")
  const pdf = readFileSync(pdfPath)
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdf.length).toBeGreaterThan(1000)
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
