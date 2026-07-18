import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

    // Theme button opens the Appearance panel; clicking a theme row applies it
    await win.click('#theme-toggle')
    await expect(win.locator('#appearance')).toBeVisible()
    await win.locator('#appearance .appearance-theme').getByText('Light', { exact: true }).click()
    const theme = await win.evaluate(() => document.body.dataset.theme)
    expect(theme).toBe('light')
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

test('zoom changes font size and the app menu exists', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const hasMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null)
    expect(hasMenu).toBe(true)

    await win.locator('#paneA .monaco-editor').click()
    const before = await win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).fontSize)
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Zoom In')
    await win.keyboard.press('Enter')
    await win.waitForTimeout(150)
    const after = await win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).fontSize)
    expect(parseFloat(after)).toBeGreaterThan(parseFloat(before))
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('appearance panel changes theme, accent, and font', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#appearance')).toBeVisible()

    // pick a distinctive theme (Monokai) → body[data-theme] changes
    await win.locator('.appearance-theme', { hasText: 'Monokai' }).click()
    await expect(win.locator('body')).toHaveAttribute('data-theme', 'monokai')
    await win.locator('.appearance-theme', { hasText: 'Nord' }).click()
    await expect(win.locator('body')).toHaveAttribute('data-theme', 'nord')

    // accent swatch → --accent custom property changes
    const before = await win.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim())
    await win.locator('.appearance-sw .swatch').nth(2).click()
    const after = await win.evaluate(() => getComputedStyle(document.body).getPropertyValue('--accent').trim())
    expect(after).not.toBe(before)

    // font family → editor option reflects it. NB: the panel has two selects since
    // v1.10.0 (editor font + interface font); the editor font is the first one.
    await win.locator('#appearance select').first().selectOption('Fira Code')
    await win.waitForTimeout(200)
    const fam = await win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).fontFamily)
    expect(fam.toLowerCase()).toContain('fira')
    // bundled IBM Plex Mono is selectable too
    await win.locator('#appearance select').first().selectOption('IBM Plex Mono')
    await win.waitForTimeout(200)
    const fam2 = await win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).fontFamily)
    expect(fam2.toLowerCase()).toContain('plex')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('file history captures versions and restores in-editor', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const filePath = join(userDataDir, 'hist.txt')
  writeFileSync(filePath, 'version-one')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('#paneA .view-lines')).toContainText('version-one')

    const runCmd = async (label: string) => {
      await win.keyboard.press('Control+Shift+P')
      await win.locator('#palette input').fill(label)
      await win.keyboard.press('Enter')
    }
    // Save v1 via palette (Ctrl+S is a native-menu accelerator Playwright can't trigger)
    await runCmd('Save')
    // edit → v2
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A'); await win.keyboard.type('version-two')
    await runCmd('Save')

    await runCmd('File History')
    await expect(win.locator('#file-history .fh-row')).toHaveCount(2)

    // restore the oldest (last row, since newest-first) → editor shows version-one
    await win.locator('#file-history .fh-row').last().locator('button', { hasText: 'Restore' }).click()
    await expect(win.locator('#paneA .view-lines')).toContainText('version-one')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('folder mode: restores a folder, shows the tree, quick-open finds a file', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-proj-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'alpha.ts'), '// alpha')
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  // Seed settings so startup-restore opens the folder (no native dialog needed).
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true
  }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    // top-level entries render (dir 'src' + file 'readme.md')
    await expect(win.locator('.sb-row', { hasText: 'readme.md' })).toBeVisible()
    await expect(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
    // quick-open finds the nested file by name
    await win.keyboard.press('Control+p')
    await expect(win.locator('#quick-open')).toBeVisible()
    await win.locator('#quick-open input').fill('alpha')
    await expect(win.locator('.qo-row', { hasText: 'alpha.ts' })).toBeVisible()
    await win.keyboard.press('Enter')
    await expect(win.locator('.tab', { hasText: 'alpha.ts' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('export commands are wired into the File ▸ Export menu', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const labels = await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find(i => i.label === 'File')!
      const exp = file.submenu!.items.find(i => i.label === 'Export')!
      return exp.submenu!.items.map(i => i.label)
    })
    expect(labels).toContain('Export to HTML…')
    expect(labels).toContain('Export to PDF…')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Format Document reformats the active buffer via the palette', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fmt-'))
  const filePath = join(userDataDir, 'ugly.js')
  writeFileSync(filePath, 'const   x=1\nfunction  f( ){return   x}')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('const')

    const runCmd = async (label: string) => {
      await win.keyboard.press('Control+Shift+P')
      await win.locator('#palette input').fill(label)
      await win.keyboard.press('Enter')
    }
    await runCmd('Format Document')
    // Save (Ctrl+S is a native-menu accelerator Playwright can't trigger) then read disk.
    await runCmd('Save')
    await expect.poll(() => readFileSync(filePath, 'utf8'), { timeout: 5000 }).toContain('const x = 1;')
    await expect.poll(() => readFileSync(filePath, 'utf8'), { timeout: 5000 }).toContain('function f() {')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('format-on-save reformats on manual Save when enabled', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fos-'))
  const filePath = join(userDataDir, 'ugly.js')
  writeFileSync(filePath, 'const   y=2')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ formatOnSave: true }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('const')
    // Touch the buffer so Save has something to write, then Save via palette.
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('End')
    await win.keyboard.type(' ')
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save')
    await win.keyboard.press('Enter')
    await expect.poll(() => readFileSync(filePath, 'utf8'), { timeout: 5000 }).toContain('const y = 2;')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('autosave-to-disk writes a named file on blur without a conflict bar', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-as-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'before')
  // Seed the setting so autosave is on at launch.
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ autoSaveToDisk: true }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('before')

    // Replace the content, then blur the window to trigger flushNow().
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A')
    await win.keyboard.type('after-autosave')
    await win.evaluate(() => window.dispatchEvent(new Event('blur')))

    // The file on disk now holds the new content.
    await expect.poll(() => readFileSync(filePath, 'utf8'), { timeout: 5000 }).toContain('after-autosave')

    // Self-write suppression: the watcher must NOT raise a "changed on disk" bar.
    await win.waitForTimeout(1500)
    await expect(win.locator('#change-bar')).toBeHidden()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Appearance has a Format on save toggle that persists', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-fosui-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#appearance')).toBeVisible()
    const row = win.locator('.appearance-row', { hasText: 'Format on save' })
    await expect(row).toBeVisible()
    await row.locator('input[type=checkbox]').check()
    await expect.poll(
      () => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).formatOnSave,
      { timeout: 5000 }
    ).toBe(true)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('drag reorders tabs and the new order persists across relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-reorder-'))
  const titlesOf = (w: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>) =>
    w.locator('.tab').evaluateAll(els => els.map(e => (e.textContent ?? '').replace('×', '').trim()))

  const app1 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app1.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Start with the one auto tab; add two more → Untitled-1, Untitled-2, Untitled-3.
    const newTab = async () => {
      await win.keyboard.press('Control+Shift+P')
      await win.locator('#palette input').fill('New Tab')
      await win.keyboard.press('Enter')
    }
    await newTab(); await newTab()
    await expect(win.locator('.tab')).toHaveCount(3)
    expect(await titlesOf(win)).toEqual(['Untitled-1', 'Untitled-2', 'Untitled-3'])

    // Drag the first tab onto the right edge of the last → it lands at the end.
    await win.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll<HTMLElement>('#tabbar .tab'))
      const src = tabs[0], last = tabs[tabs.length - 1]
      const dt = new DataTransfer()
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      const r = last.getBoundingClientRect()
      const opts: DragEventInit = { bubbles: true, dataTransfer: dt, clientX: r.right - 2, clientY: r.top + 5 }
      last.dispatchEvent(new DragEvent('dragover', opts))
      last.dispatchEvent(new DragEvent('drop', opts))
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    })

    await expect.poll(() => titlesOf(win)).toEqual(['Untitled-2', 'Untitled-3', 'Untitled-1'])
    await win.waitForTimeout(800) // let the debounced session save flush
  } finally {
    await app1.close()
  }

  const app2 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win2 = await app2.firstWindow()
    await expect(win2.locator('#tabbar')).toBeVisible()
    await expect.poll(() => titlesOf(win2)).toEqual(['Untitled-2', 'Untitled-3', 'Untitled-1'])

    // Regression: the tabBar rewrite must keep close-× and the + add button working.
    await win2.locator('.tab').last().locator('.tab-close').click()
    await expect(win2.locator('.tab')).toHaveCount(2)
    await win2.locator('.tab-add').click()
    await expect(win2.locator('.tab')).toHaveCount(3)
  } finally {
    await app2.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('command palette is one stacked box and still runs commands', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    // input is nested inside the palette box (not a loose flex child)
    await expect(win.locator('#palette .palette-box input')).toBeVisible()
    // list is a sibling inside the same box
    await expect(win.locator('#palette .palette-box .palette-list')).toBeVisible()
    // running a command still works: New Tab -> 2 tabs
    await win.locator('#palette .palette-box input').fill('New Tab')
    await win.keyboard.press('Enter')
    await expect(win.locator('.tab')).toHaveCount(2)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('status bar reads as quiet chrome, not an accent slab', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#statusbar')).toBeVisible()
    // panel-bg and bar resolve to the same color in every theme, so a de-loudified
    // status bar (panel-bg) matches the header (bar); the old accent slab did not.
    const [sbBg, headerBg] = await win.evaluate(() => {
      const bg = (sel: string) => getComputedStyle(document.querySelector(sel)!).backgroundColor
      return [bg('#statusbar'), bg('#header')]
    })
    expect(sbBg).toBe(headerBg)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('floating chrome carries an accent border', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    // the box border should resolve to the same colour as --accent (Phase 3.5 P2).
    // resolve --accent to rgb via a probe so both sides are comparable rgb strings.
    const [border, accent] = await win.evaluate(() => {
      const box = getComputedStyle(document.querySelector('.palette-box')!).borderTopColor
      const probe = document.createElement('span')
      probe.style.color = 'var(--accent)'
      document.body.appendChild(probe)
      const accent = getComputedStyle(probe).color
      probe.remove()
      return [box, accent]
    })
    expect(border).toBe(accent)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('accent: light preset auto-contrasts text to dark', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-accent-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#appearance')).toBeVisible()
    // 18 curated presets (no default swatch); current shown via preview + Default reset
    await expect(win.locator('#appearance .appearance-sw .swatch')).toHaveCount(18)
    await expect(win.locator('#appearance .accent-current')).toHaveCount(1)
    await expect(win.locator('#appearance .accent-default-btn')).toHaveCount(1)
    // pick the light Yellow preset → accent-text auto-derives dark
    await win.locator('#appearance .appearance-sw .swatch[title="Yellow"]').click()
    const accentText = await win.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--accent-text').trim())
    expect(accentText).toBe('#111111')
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('empty states show an inline-SVG glyph', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-empty-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette .palette-box input').fill('Manage Snippets')
    await win.keyboard.press('Enter')
    await expect(win.locator('.snip-mgr-empty .empty-glyph svg')).toBeVisible()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('chrome polish: themed checkbox + icon-only theme button', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-chrome-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // theme button is icon-only
    await expect(win.locator('#theme-toggle')).toHaveText('◐')
    // a checkbox resolves accent-color to --accent
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#appearance')).toBeVisible()
    const [accentColor, accent] = await win.evaluate(() => {
      const cb = document.querySelector('#appearance input[type=checkbox]')!
      const probe = document.createElement('span'); probe.style.color = 'var(--accent)'
      document.body.appendChild(probe); const accent = getComputedStyle(probe).color; probe.remove()
      return [getComputedStyle(cb).accentColor, accent]
    })
    expect(accentColor).toBe(accent)
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('overlays use the micro-motion entry animation', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    const anim = await win.locator('#palette .palette-box')
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(anim).toContain('overlayIn')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('toolbar File History button opens the panel and the regroup keeps all buttons', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#toolbar')).toBeVisible()

    // Regroup regression: every pre-existing button must still be present (located by title).
    for (const title of ['Open file', 'Save', 'Toggle split pane', 'Toggle markdown preview',
                         'Toggle always on top', 'Start diff', 'Paste from history']) {
      await expect(win.locator(`.tb-btn[title="${title}"]`)).toHaveCount(1)
    }
    // The highlighter (the button that moves groups) survives — its title is dynamic, match partial.
    await expect(win.locator('.tb-btn[title*="Highlighter"]')).toHaveCount(1)

    // New: a File History button exists and opens the panel (empty state for an unsaved buffer).
    const histBtn = win.locator('.tb-btn[title="File History"]')
    await expect(histBtn).toHaveCount(1)
    await histBtn.click()
    await expect(win.locator('#file-history')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('opening a diff keeps the current theme (does not flip editors to light)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-diff-theme-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'left content')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('left content')

    // Switch to Monokai — a dark theme whose id is NOT literally 'dark'.
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#appearance')).toBeVisible()
    await win.locator('.appearance-theme', { hasText: 'Monokai' }).click()
    await expect(win.locator('body')).toHaveAttribute('data-theme', 'monokai')
    await win.keyboard.press('Escape') // close the appearance panel

    // Seed the Electron clipboard so 'Diff: current vs clipboard' has a right side.
    await app.evaluate(({ clipboard }) => clipboard.writeText('right content'))

    // Open the diff via the palette.
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Diff: current vs clipboard')
    await win.keyboard.press('Enter')
    await expect(win.locator('#diff')).toBeVisible()

    // Monaco's theme is GLOBAL: creating the diff editor must not reset it. The diff must
    // render in Monokai's editor background (#272822 = rgb(39,40,34)), NOT the built-in
    // light 'vs' white. Before the fix this stayed white, dragging the panes light too.
    await expect.poll(
      () => win.locator('#diff .monaco-editor-background').first()
        .evaluate(el => getComputedStyle(el).backgroundColor),
      { timeout: 5000 }
    ).toBe('rgb(39, 40, 34)')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('tabs have rounded top corners and square bottoms', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('.tab')).toHaveCount(1) // the auto-created Untitled-1 tab

    const [topLeft, topRight, bottomLeft] = await win.locator('.tab').first().evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius]
    })
    // Top-only rounding: top corners curved, bottom flush with the strip.
    expect(topLeft).not.toBe('0px')
    expect(topRight).not.toBe('0px')
    expect(bottomLeft).toBe('0px')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

