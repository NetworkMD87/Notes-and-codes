import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'
import { openSettings } from './settingsHelper'

test('duplicate tabs reserve space for filename and folder, with full paths and accessible unsaved state', async ({ smoke }, testInfo) => {
  const userDataDir = smoke.tempDir('notes-tab-labels-')
  const projectDir = smoke.tempDir('notes-tab-label-project-')
  const filename = 'a-very-long-descriptive-filename-that-needs-truncation.md'
  const paths = ['project-a', 'project-b', 'project'].map((project, index) => {
    const directory = index === 2 ? join(projectDir, project) : join(projectDir, project, 'src')
    mkdirSync(directory, { recursive: true })
    const path = join(directory, filename)
    writeFileSync(path, '# Heading')
    return path
  })
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: paths.map((filePath, index) => ({
      id: `file-${index}`, title: filename, filePath, content: '# Heading', language: 'markdown',
      eol: 'LF', encoding: 'utf8', dirty: false,
    })), activeId: 'file-0',
  }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  const tabs = win.locator('#tabbar .tab')
  await expect(tabs).toHaveCount(3)
  await expect(tabs.nth(0).locator('.tab-folder')).toHaveText('project-a\\src')
  await expect(tabs.nth(1).locator('.tab-folder')).toHaveText('project-b\\src')
  const first = tabs.nth(0).getByRole('tab')
  await expect(first).toHaveAttribute('title', paths[0])
  await expect(first).toHaveAttribute('aria-label', `${filename}, ${paths[0]}`)
  await expect(tabs.nth(0).getByRole('button')).toHaveAttribute('aria-label', `Close ${filename}, ${paths[0]}`)

  for (const width of [800, 1400]) {
    await win.setViewportSize({ width, height: 650 })
    const layout = await tabs.nth(0).evaluate(tab => {
      const title = tab.querySelector<HTMLElement>('.tab-title')!
      const folder = tab.querySelector<HTMLElement>('.tab-folder')!
      const folderSuffix = tab.querySelector<HTMLElement>('.tab-folder-suffix')!
      const key = tab.querySelector<HTMLElement>('.tab-folder-key')!.getBoundingClientRect()
      const close = tab.querySelector<HTMLElement>('.tab-close')!
      const badge = tab.querySelector<HTMLElement>('.badge')!
      return {
        tabWidth: tab.getBoundingClientRect().width,
        titleWidth: title.getBoundingClientRect().width, folderWidth: folder.getBoundingClientRect().width,
        titleEllipsis: getComputedStyle(title).textOverflow, folderEllipsis: getComputedStyle(tab.querySelector('.tab-folder-rest')!).textOverflow,
        titleTruncated: title.scrollWidth > title.clientWidth,
        folderTruncated: folderSuffix.scrollWidth > folderSuffix.clientWidth ||
          tab.querySelector<HTMLElement>('.tab-folder-prefix')!.scrollWidth > tab.querySelector<HTMLElement>('.tab-folder-prefix')!.clientWidth,
        keyVisible: key.left >= folder.getBoundingClientRect().left && key.right <= folder.getBoundingClientRect().right,
        keyLeft: key.left, keyRight: key.right, folderBox: folder.getBoundingClientRect().toJSON(),
        titleRight: title.getBoundingClientRect().right, folderLeft: folder.getBoundingClientRect().left,
        folderRight: folder.getBoundingClientRect().right, closeLeft: close.getBoundingClientRect().left,
        closeShrink: getComputedStyle(close).flexShrink, badgeShrink: getComputedStyle(badge).flexShrink,
      }
    })
    console.log(`duplicate tab layout at ${width}: ${JSON.stringify(layout)}`)
    const screenshot = testInfo.outputPath(`duplicate-tabs-${width}.png`)
    await win.locator('#header').screenshot({ path: screenshot })
    expect(layout.tabWidth).toBeLessThanOrEqual(168)
    expect(layout.titleWidth).toBeGreaterThan(8)
    expect(layout.folderWidth).toBeGreaterThan(8)
    expect(layout.titleEllipsis).toBe('ellipsis'); expect(layout.folderEllipsis).toBe('ellipsis')
    expect(layout.titleTruncated).toBe(true); expect(layout.folderTruncated).toBe(true)
    expect(layout.keyVisible).toBe(true)
    expect(layout.titleRight).toBeLessThanOrEqual(layout.folderLeft)
    expect(layout.folderRight).toBeLessThanOrEqual(layout.closeLeft)
    expect(layout.closeShrink).toBe('0'); expect(layout.badgeShrink).toBe('0')
    await expect(tabs.nth(0).locator('.tab-folder-suffix')).toHaveText('a\\src')
    await expect(tabs.nth(1).locator('.tab-folder-suffix')).toHaveText('b\\src')
    await expect(tabs.nth(2).locator('.tab-folder-key')).toHaveText('t')
    const shorterFolder = await tabs.nth(2).evaluate(tab => {
      const key = tab.querySelector('.tab-folder-key')!.getBoundingClientRect()
      const folder = tab.querySelector('.tab-folder')!.getBoundingClientRect()
      return { width: key.width, left: key.left, right: key.right, folderLeft: folder.left, folderRight: folder.right }
    })
    console.log(`shorter folder layout at ${width}: ${JSON.stringify(shorterFolder)}`)
    expect(shorterFolder.width).toBeGreaterThan(0)
    expect(shorterFolder.left).toBeGreaterThanOrEqual(shorterFolder.folderLeft - 0.01)
    expect(shorterFolder.right).toBeLessThanOrEqual(shorterFolder.folderRight + 0.01)
    await testInfo.attach(`duplicate-tabs-${width}.png`, { path: screenshot, contentType: 'image/png' })
  }

  for (const theme of ['Light', 'High Contrast']) {
    await openSettings(win)
    await win.getByRole('radio', { name: theme, exact: true }).click()
    await win.keyboard.press('Escape')
    await expect(tabs.nth(0).locator('.tab-folder')).toBeVisible()
  }
  await openSettings(win)
  await win.getByRole('button', { name: 'Tab sizing' }).click()
  await win.getByRole('option', { name: 'Natural width' }).click()
  await win.keyboard.press('Escape')
  await expect(win.locator('#tabbar')).toHaveAttribute('data-tab-sizing', 'natural')
  for (const selector of ['.tab-folder-prefix', '.tab-folder-suffix']) {
    const natural = await tabs.nth(0).locator(selector).evaluate(folder => ({ width: folder.clientWidth, text: folder.scrollWidth }))
    expect(natural.width).toBe(natural.text)
  }

  const editor = win.locator('#paneA textarea.inputarea')
  await editor.focus(); await win.keyboard.type('x')
  await expect(first).toHaveAttribute('title', `${paths[0]}\nUnsaved changes`)
  await expect(first).toHaveAttribute('aria-label', `${filename}, ${paths[0]}, Unsaved changes`)
  await expect(tabs.nth(0).locator('.tab-title')).toContainText('●')
  await tabs.nth(1).getByRole('button').focus()
  await win.keyboard.press('Enter')
  await expect(tabs).toHaveCount(2)
  await tabs.nth(1).getByRole('button').focus()
  await win.keyboard.press('Enter')
  await expect(tabs).toHaveCount(1)
  await expect(tabs.nth(0).locator('.tab-folder')).toBeHidden()
  await expect(tabs.nth(0).getByRole('tab')).toBeFocused()
})

test('opening, renaming, and Save As recalculate duplicate tab labels through the real app', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-tab-identity-')
  const projectDir = smoke.tempDir('notes-tab-identity-project-')
  for (const directory of ['client', 'server', 'archive']) mkdirSync(join(projectDir, directory))
  const firstPath = join(projectDir, 'client', 'README.md')
  const secondPath = join(projectDir, 'server', 'README.md')
  const saveAsPath = join(projectDir, 'archive', 'README.md')
  writeFileSync(firstPath, '# Client'); writeFileSync(secondPath, '# Server')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await smoke.launch({
    args: ['out/main/index.js', firstPath, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_HEADLESS: '1', NC_TEST_SAVE_AS_PATHS: JSON.stringify([saveAsPath]) },
  })
  const win = await app.firstWindow()
  await waitForBoot(win)
  const tabs = win.locator('#tabbar .tab')
  await expect(tabs).toHaveCount(1)
  await expect(tabs.locator('.tab-folder')).toBeHidden()
  await win.locator('.sb-row', { hasText: 'server' }).click()
  const row = win.locator('.sb-row', { hasText: 'README.md' })
  await row.click()
  await expect(tabs).toHaveCount(2)
  await expect(tabs.nth(0).locator('.tab-folder')).toHaveText('client')
  await expect(tabs.nth(1).locator('.tab-folder')).toHaveText('server')

  await row.click({ button: 'right' })
  await win.getByRole('menuitem', { name: 'Rename…' }).click()
  await win.locator('.input-overlay input').fill('OTHER.md')
  await win.locator('.input-overlay input').press('Enter')
  await expect(tabs.nth(1).locator('.tab-title')).toHaveText('OTHER.md')
  await expect(tabs.nth(0).locator('.tab-folder')).toBeHidden()
  await expect(tabs.nth(1).locator('.tab-folder')).toBeHidden()
  await expect.poll(async () => (await tabs.nth(1).getByRole('tab').getAttribute('title'))?.replaceAll('/', '\\'))
    .toBe(join(projectDir, 'server', 'OTHER.md'))

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!.submenu!.items
      .find(item => item.label === 'Save As…')!.click()
  })
  await expect(tabs.nth(1).getByRole('tab')).toHaveAttribute('title', saveAsPath)
  await expect(tabs.nth(0).locator('.tab-folder')).toHaveText('client')
  await expect(tabs.nth(1).locator('.tab-folder')).toHaveText('archive')
  await expect(tabs.nth(1).getByRole('tab')).toHaveAttribute('aria-label', `README.md, ${saveAsPath}`)
  expect(readFileSync(saveAsPath, 'utf8')).toBe('# Server')
})
