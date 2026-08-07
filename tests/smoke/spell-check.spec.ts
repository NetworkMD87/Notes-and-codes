import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openSettings } from './settingsHelper'

async function launch(userDataDir: string, filePath?: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const args = ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  if (filePath) args.push(filePath)
  const app = await electron.launch({ args })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  if (filePath) {
    const title = filePath.split(/[\\/]/).pop()!
    const tab = win.locator('.tab', { hasText: title })
    await expect(tab).toBeVisible()
    await tab.click()
  }
  return { app, win }
}

async function launchWithHungSpellWorker(userDataDir: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_HEADLESS: '1', NC_TEST_HANG_SPELL_WORKER: '1' } as Record<string, string>,
  })
  return { app, win: await app.firstWindow() }
}

async function launchWithFailedSpellWorkerConstruction(userDataDir: string, filePath: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: {
      ...process.env,
      NC_HEADLESS: '1',
      NC_TEST_FAIL_SPELL_WORKER_CONSTRUCTION: '1',
    } as Record<string, string>,
  })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  const tab = win.locator('.tab', { hasText: filePath.split(/[\\/]/).pop()! })
  await expect(tab).toBeVisible()
  await tab.click()
  return { app, win }
}

async function launchWithNetworkBlock(userDataDir: string, filePath: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: {
      ...process.env,
      NC_HEADLESS: '1',
      NC_TEST_BLOCK_NETWORK: '1',
    } as Record<string, string>,
  })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  return { app, win }
}

async function launchHeadless(userDataDir: string, filePath?: string): Promise<{
  app: ElectronApplication
  win: Page
}> {
  const args = ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  if (filePath) args.push(filePath)
  const app = await electron.launch({
    args,
    env: { ...process.env, NC_HEADLESS: '1' } as Record<string, string>,
  })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  if (filePath) {
    const tab = win.locator('.tab', { hasText: filePath.split(/[\\/]/).pop()! })
    await expect(tab).toBeVisible()
    await tab.click()
  }
  return { app, win }
}

async function replaceEditorText(win: Page, text: string, pane = '#paneA'): Promise<void> {
  await win.locator(`${pane} .monaco-editor`).click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText(text)
}

function spellErrors(win: Page, pane = '#paneA') {
  return win.locator(`${pane} .spell-error`)
}

async function openSpellContextMenu(win: Page, occurrence = 0, pane = '#paneA') {
  const underline = spellErrors(win, pane).nth(occurrence)
  await expect(underline).toBeVisible()
  try {
    await underline.click({ button: 'right', timeout: 1_000 })
  } catch {
    const box = await underline.boundingBox()
    if (!box) throw new Error('Spell-error underline has no pointer target')
    await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  }
  const menu = win.locator('#ctx-menu')
  await expect(menu).toBeVisible()
  return menu
}

async function useRightClickSpellAction(
  win: Page,
  label: string,
  occurrence = 0,
  pane = '#paneA',
): Promise<void> {
  const menu = await openSpellContextMenu(win, occurrence, pane)
  await menu.locator('.ctx-item', { hasText: new RegExp(`^${label}$`) }).click()
}

async function rightClickRenderedText(
  win: Page,
  text: string,
  occurrence = 0,
  pane = '#paneA',
): Promise<void> {
  const line = win.locator(`${pane} .view-line`, { hasText: text }).nth(occurrence)
  await expect(line).toBeVisible()
  await line.click({ button: 'right', position: { x: 4, y: 4 } })
}

async function expectMonacoContextMenu(win: Page): Promise<void> {
  await expect(win.locator('#ctx-menu')).toHaveCount(0)
  await expect(win.locator('.monaco-menu-container')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.locator('.monaco-menu-container')).toBeHidden()
}

async function selectFirstMisspelling(win: Page, pane = '#paneA'): Promise<void> {
  await win.locator(`${pane} .monaco-editor`).click()
  await win.keyboard.press('Control+Home')
  for (let character = 0; character < 'speling'.length; character++) {
    await win.keyboard.press('Shift+ArrowRight')
  }
}

async function quitDirtyApp(app: ElectronApplication, win: Page): Promise<void> {
  const exited = new Promise<void>(resolve => app.process().once('exit', () => resolve()))
  await win.evaluate(() => window.api.quitNow())
  await exited
}

async function useReplacement(win: Page, replacement: string, pane = '#paneA'): Promise<void> {
  await win.locator(`${pane} .monaco-editor`).click()
  await win.keyboard.press('Control+Home')
  await win.keyboard.press('ArrowRight')
  await win.keyboard.press('Control+.')
  const row = win.locator('.action-widget .monaco-list-row', { hasText: replacement }).first()
  await expect(row).toBeVisible()
  const focused = win.locator('.action-widget .monaco-list-row.focused')
  const targetIndex = Number(await row.getAttribute('data-index'))
  const focusedIndex = Number(await focused.getAttribute('data-index'))
  const key = targetIndex >= focusedIndex ? 'ArrowDown' : 'ArrowUp'
  for (let step = 0; step < Math.abs(targetIndex - focusedIndex); step++) await win.keyboard.press(key)
  await win.keyboard.press('Enter')
}

test('a non-responsive spell worker does not block app boot', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-hung-'))
  const { app, win } = await launchWithHungSpellWorker(userDataDir)
  try {
    expect(new URL(win.url()).searchParams.get('nc-spell-worker')).toBe('hang')
    await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
    await replaceEditorText(win, 'speling remains editable')
    await expect(win.locator('#paneA .view-lines')).toContainText('speling remains editable')
    await win.waitForTimeout(700)
    await expect(spellErrors(win)).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a spell worker constructor failure cannot become a session restore failure or block editing', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-constructor-'))
  const filePath = join(userDataDir, 'constructor.txt')
  writeFileSync(filePath, 'ordinary text')
  const { app, win } = await launchWithFailedSpellWorkerConstruction(userDataDir, filePath)
  try {
    await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
    await expect(win.locator('.toast--warning')).toHaveCount(1)
    await expect(win.locator('.toast--warning')).not.toContainText('ordinary text')
    await expect(win.locator('.toast')).not.toContainText('restore your last session')
    await replaceEditorText(win, 'editing and saving still work')
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save')
    await win.keyboard.press('Enter')
    await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('editing and saving still work')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a first worker crash warns once, recovers, and never blocks editing or saving', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-recover-'))
  const filePath = join(userDataDir, 'recover.txt')
  writeFileSync(filePath, 'ordinary text')
  const { app, win } = await launchHeadless(userDataDir, filePath)
  try {
    expect(new URL(win.url()).searchParams.get('nc-headless')).toBe('1')
    await win.waitForTimeout(700)
    await win.evaluate(() => window.__ncSpellTest!.failNextWorkerRequest())
    await replaceEditorText(win, 'speling after recovery')

    await expect(win.locator('.toast--warning')).toHaveCount(1)
    await expect(win.locator('.toast--warning')).not.toContainText('speling')
    await replaceEditorText(win, 'ordinary text saves successfully')
    // Native menu accelerators are not reliably triggered through Playwright; the palette
    // reaches the same public Save command without bypassing renderer/main IPC.
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save')
    await win.keyboard.press('Enter')
    await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('ordinary text saves successfully')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a held stale response from model A cannot decorate replacement model B', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-stale-'))
  const firstPath = join(userDataDir, 'first.txt')
  const secondPath = join(userDataDir, 'second.txt')
  writeFileSync(firstPath, 'ordinary first')
  writeFileSync(secondPath, 'ordinary second')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'first', title: 'first.txt', filePath: firstPath, content: 'ordinary first', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'second', title: 'second.txt', filePath: secondPath, content: 'ordinary second', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'first',
  }))
  const { app, win } = await launchHeadless(userDataDir)
  try {
    await win.waitForTimeout(700)
    await win.evaluate(() => window.__ncSpellTest!.delayNextChecks(2))
    await replaceEditorText(win, 'speling in model A')
    await expect.poll(() => win.evaluate(() => window.__ncSpellTest!.delayedCheckCount())).toBe(1)

    await win.locator('.tab', { hasText: 'second.txt' }).click()
    await expect(win.locator('#paneA .view-lines')).toContainText('ordinary second')
    await win.evaluate(() => window.__ncSpellTest!.releaseNextCheck())
    await expect.poll(() => win.evaluate(() => window.__ncSpellTest!.delayedCheckCount())).toBe(1)

    await expect(spellErrors(win), 'replacement model B has zero stale decorations before its held response is released').toHaveCount(0)
    await win.evaluate(() => window.__ncSpellTest!.releaseNextCheck())
    await expect(spellErrors(win)).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('UK and US correction workflow succeeds while every external request is actively blocked', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-offline-'))
  const filePath = join(userDataDir, 'offline.txt')
  writeFileSync(filePath, 'ordinary')
  const { app, win } = await launchWithNetworkBlock(userDataDir, filePath)
  try {
    await openSettings(win, 'Editor')
    await win.getByLabel('Spell check language').selectOption('en-US')
    await win.keyboard.press('Escape')
    await replaceEditorText(win, 'colour')
    await expect(spellErrors(win)).toHaveCount(1)
    await useReplacement(win, 'color')
    await expect(win.locator('#paneA .view-lines')).toContainText('color')

    await openSettings(win, 'Editor')
    await win.getByLabel('Spell check language').selectOption('en-GB')
    await win.keyboard.press('Escape')
    await replaceEditorText(win, 'color')
    await expect(spellErrors(win)).toHaveCount(1)
    await useReplacement(win, 'colour')
    await expect(win.locator('#paneA .view-lines')).toContainText('colour')

    const external = await app.evaluate(() => (
      globalThis as typeof globalThis & { __ncSpellExternalRequests?: string[] }
    ).__ncSpellExternalRequests)
    expect(external).toEqual([])
  } finally {
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('decorates exactly one plain-text misspelling after the edit debounce', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-plain-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'placeholder')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    expect(await app.evaluate(() => (
      globalThis as typeof globalThis & { __ncSpellExternalRequests?: string[] }
    ).__ncSpellExternalRequests)).toBeUndefined()
    await expect(win.locator('.tab', { hasText: 'note.txt' })).toBeVisible()
    await replaceEditorText(win, 'This is a speling mistake.')
    await expect(spellErrors(win)).toHaveCount(1)
    await expect(spellErrors(win)).toHaveText('speling')
  } finally {
    // Bypass the user-facing unsaved-changes prompt during test cleanup.
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('correct text and keyboard context-menu invocations remain Monaco-owned', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-correct-menu-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'ordinary speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(win.locator('#paneA .view-lines')).toContainText('ordinary speling')
    await expect(
      spellErrors(win),
      'misspelled control word proves eligible-buffer spell checking completed',
    ).toHaveCount(1)
    await expect(spellErrors(win)).toHaveText('speling')

    await rightClickRenderedText(win, 'ordinary')
    await expectMonacoContextMenu(win)

    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+Home')
    await win.keyboard.press('ArrowRight')
    await win.keyboard.press('Shift+F10')
    await expectMonacoContextMenu(win)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('does not decorate the identical word in a TypeScript buffer', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-ts-'))
  const controlPath = join(userDataDir, 'control.txt')
  const typeScriptPath = join(userDataDir, 'note.ts')
  writeFileSync(controlPath, 'speling control')
  writeFileSync(typeScriptPath, 'This is a speling mistake.')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'control', title: 'control.txt', filePath: controlPath, content: 'speling control', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'typescript', title: 'note.ts', filePath: typeScriptPath, content: 'This is a speling mistake.', language: 'typescript', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'control',
  }))
  const { app, win } = await launch(userDataDir)
  try {
    await win.locator('.tb-btn[title="Toggle split pane"]').click()
    await expect(win.locator('#paneB')).toBeVisible()
    await win.locator('#paneB .monaco-editor').click()
    await win.locator('.tab', { hasText: 'note.ts' }).click()

    await expect(win.locator('#paneA .view-lines')).toContainText('speling control')
    await expect(win.locator('#paneB .view-lines')).toContainText('This is a speling mistake.')
    await expect(
      spellErrors(win, '#paneA'),
      'eligible control pane proves spell initialization completed',
    ).toHaveCount(1)

    await expect(
      spellErrors(win, '#paneB'),
      'TypeScript buffer has zero .spell-error decorations',
    ).toHaveCount(0)
    await rightClickRenderedText(win, 'speling', 0, '#paneB')
    await expectMonacoContextMenu(win)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('checks Markdown prose but excludes inline and fenced code', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-md-'))
  const filePath = join(userDataDir, 'note.md')
  writeFileSync(filePath, 'speling prose\n\n`speling`\n\n```ts\nspeling\n```')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(win.locator('#paneA .view-lines')).toContainText('speling')

    await expect(
      spellErrors(win),
      'fenced mispeling has zero .spell-error; only prose decorates',
    ).toHaveCount(1)
    await expect(spellErrors(win)).toHaveText('speling')
    // The last matching `.view-line` is the fenced-code occurrence, independently of how Monaco
    // tokenizes the earlier inline-code line into nested spans.
    await rightClickRenderedText(win, 'speling', -1)
    await expectMonacoContextMenu(win)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Quick Fix replaces one occurrence as one undoable edit', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-fix-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'speling and speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(spellErrors(win)).toHaveCount(2)
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+Home')
    await win.keyboard.press('ArrowRight')
    await win.keyboard.press('Control+.')

    const spellingAction = win.locator('.action-widget .monaco-list-row', { hasText: 'spelling' }).first()
    await expect(spellingAction).toBeVisible()
    // Monaco's pointer-block layer intentionally intercepts mouse events over this widget. The
    // first replacement is focused, so Enter exercises the same public code-action command path.
    await win.keyboard.press('Enter')

    await expect(win.locator('#paneA .view-lines')).toContainText('spelling and speling')
    await expect(spellErrors(win)).toHaveCount(1)

    await win.keyboard.press('Control+Z')
    await expect(win.locator('#paneA .view-lines')).toContainText('speling and speling')
    await expect(spellErrors(win)).toHaveCount(2)
  } finally {
    // Undo restores the bytes but the buffer remains dirty until saved.
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('right-clicking an underline replaces the clicked occurrence as one undoable edit', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-pointer-fix-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'speling and speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(spellErrors(win)).toHaveCount(2)
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+End')
    const menu = await openSpellContextMenu(win)
    await expect(
      menu.locator('.ctx-item', { hasText: /^Copy$/ }),
      'spell-aware menu retains Monaco Copy',
    ).toBeVisible()
    for (const label of [
      'spelling',
      'Ignore for this session',
      'Add to personal dictionary',
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Select All',
      'Command Palette',
    ]) {
      await expect(menu.locator('.ctx-item', { hasText: new RegExp(`^${label}$`) })).toBeVisible()
    }
    await app.evaluate(({ clipboard }) => clipboard.writeText('copy-sentinel-not-document-text'))
    await menu.locator('.ctx-item', { hasText: /^Copy$/ }).click()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toMatch(/^speling and speling\r?\n$/)
    await expect(
      win.locator('#paneA .view-lines'),
      'Copy leaves the real buffer unchanged',
    ).toContainText('speling and speling')
    await expect(spellErrors(win)).toHaveCount(2)

    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+End')
    await useRightClickSpellAction(win, 'spelling')

    await expect(
      win.locator('#paneA .view-lines'),
      'right-click replacement changes the clicked first occurrence, not the caret occurrence',
    ).toContainText('spelling and speling')
    await expect(spellErrors(win)).toHaveCount(1)

    await win.keyboard.press('Control+Z')
    await expect(win.locator('#paneA .view-lines')).toContainText('speling and speling')
    await expect(spellErrors(win)).toHaveCount(2)
  } finally {
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('spell-aware Cut removes the selected misspelling and writes it to the system clipboard', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-cut-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'speling and speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(spellErrors(win)).toHaveCount(2)
    await selectFirstMisspelling(win)
    await useRightClickSpellAction(win, 'Cut')

    await expect(
      win.locator('#paneA .view-line'),
      'Cut removes the selected first misspelling from the real buffer',
    ).toHaveText('and speling')
    await expect(spellErrors(win)).toHaveCount(1)
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe('speling')
  } finally {
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('spell-aware Paste replaces the selected misspelling from the system clipboard', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-paste-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'speling and speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(spellErrors(win)).toHaveCount(2)
    await app.evaluate(({ clipboard }) => clipboard.writeText('corrected'))
    await selectFirstMisspelling(win)
    await useRightClickSpellAction(win, 'Paste')

    await expect(
      win.locator('#paneA .view-line'),
      'Paste replaces the selected first misspelling in the real buffer',
    ).toHaveText('corrected and speling')
    await expect(spellErrors(win)).toHaveCount(1)
  } finally {
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('both visible split panes hold independent spell decorations', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-split-'))
  const firstPath = join(userDataDir, 'first.txt')
  const secondPath = join(userDataDir, 'second.txt')
  writeFileSync(firstPath, 'speling one')
  writeFileSync(secondPath, 'speling two')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'first', title: 'first.txt', filePath: firstPath, content: 'speling one', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'second', title: 'second.txt', filePath: secondPath, content: 'speling two', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'first',
  }))
  const { app, win } = await launch(userDataDir)
  try {
    await expect(spellErrors(win, '#paneA')).toHaveCount(1)
    await win.locator('.tb-btn[title="Toggle split pane"]').click()
    await expect(win.locator('#paneB')).toBeVisible()
    await win.locator('#paneB .monaco-editor').click()
    await win.locator('.tab', { hasText: 'second.txt' }).click()

    await expect(win.locator('#paneA .view-lines')).toContainText('speling one')
    await expect(win.locator('#paneB .view-lines')).toContainText('speling two')
    await expect(spellErrors(win, '#paneA')).toHaveCount(1)
    await expect(spellErrors(win, '#paneB')).toHaveCount(1)
    await expect(spellErrors(win, '#paneA')).toHaveText('speling')
    await expect(spellErrors(win, '#paneB')).toHaveText('speling')

    await win.locator('#paneA .monaco-editor').click()
    await useRightClickSpellAction(win, 'spelling', 0, '#paneB')
    await expect(win.locator('#paneA .view-lines')).toContainText('speling one')
    await expect(win.locator('#paneB .view-lines')).toContainText('spelling two')
    await expect(spellErrors(win, '#paneA')).toHaveCount(1)
    await expect(spellErrors(win, '#paneB')).toHaveCount(0)
  } finally {
    await quitDirtyApp(app, win)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('disabling clears spell decorations immediately and enabling restores them', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-toggle-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'speling')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(spellErrors(win)).toHaveCount(1)
    await openSettings(win, 'Editor')
    const toggle = win.locator('.appearance-row', {
      hasText: 'Check spelling in plain text and Markdown',
    }).locator('input[type=checkbox]')

    await toggle.uncheck()
    await expect(spellErrors(win)).toHaveCount(0)
    await toggle.check()
    await expect(spellErrors(win)).toHaveCount(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a personal word clears case variants, persists, and removal rechecks the document', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-personal-'))
  const filePath = join(userDataDir, 'note.txt')
  // `zzzxqv` is a deliberately unfiltered non-word absent from both bundled dictionaries. It
  // stays misspelled after saving Openaiish, so its positive decoration after relaunch is the
  // completion signal that spell initialization and the first check actually finished.
  writeFileSync(filePath, 'Openaiish openaiish zzzxqv')
  let app: ElectronApplication
  let win: Page
  ;({ app, win } = await launch(userDataDir, filePath))
  try {
    const personalErrors = () => spellErrors(win).filter({ hasText: /^openaiish$/i })
    const controlError = () => spellErrors(win).filter({ hasText: 'zzzxqv' })
    await expect(personalErrors()).toHaveCount(2)
    await expect(controlError()).toHaveCount(1)
    await useRightClickSpellAction(win, 'Add to personal dictionary')
    await expect(personalErrors()).toHaveCount(0)
    await expect(controlError()).toHaveCount(1)
    await app.close()

    ;({ app, win } = await launch(userDataDir, filePath))
    // Do not use a fixed delay plus zero decorations: boot can finish before async dictionary
    // initialization, making "nothing yet" pass for the wrong reason. The control word must
    // decorate first; only then is absence of the two persisted variants meaningful.
    await expect(controlError()).toHaveCount(1)
    await expect(personalErrors()).toHaveCount(0)

    await openSettings(win, 'Editor')
    await win.locator('.personal-dictionary-open').click()
    const row = win.locator('.personal-word', { hasText: /openaiish/i })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Remove' }).click()
    await expect(row).toHaveCount(0)
    await expect(personalErrors()).toHaveCount(2)
    await expect(controlError()).toHaveCount(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Ignore for this session clears case variants but does not survive relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-ignore-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'Openaiish openaiish')
  let app: ElectronApplication
  let win: Page
  ;({ app, win } = await launch(userDataDir, filePath))
  try {
    await expect(spellErrors(win)).toHaveCount(2)
    await useRightClickSpellAction(win, 'Ignore for this session')
    await expect(spellErrors(win)).toHaveCount(0)
    await app.close()

    ;({ app, win } = await launch(userDataDir, filePath))
    await expect(spellErrors(win)).toHaveCount(2)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('switching UK and US rechecks both visible split panes', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-locale-split-'))
  const firstPath = join(userDataDir, 'british.txt')
  const secondPath = join(userDataDir, 'american.txt')
  writeFileSync(firstPath, 'colour')
  writeFileSync(secondPath, 'color')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'british', title: 'british.txt', filePath: firstPath, content: 'colour', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'american', title: 'american.txt', filePath: secondPath, content: 'color', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'british',
  }))
  const { app, win } = await launch(userDataDir)
  try {
    await win.locator('.tb-btn[title="Toggle split pane"]').click()
    await win.locator('#paneB .monaco-editor').click()
    await win.locator('.tab', { hasText: 'american.txt' }).click()
    await openSettings(win, 'Editor')
    const language = win.getByLabel('Spell check language')

    await language.selectOption('en-GB')
    await expect(spellErrors(win, '#paneA')).toHaveCount(0)
    await expect(spellErrors(win, '#paneB')).toHaveCount(1)
    await language.selectOption('en-US')
    await expect(spellErrors(win, '#paneA')).toHaveCount(1)
    await expect(spellErrors(win, '#paneB')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
