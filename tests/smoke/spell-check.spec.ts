import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

async function replaceEditorText(win: Page, text: string, pane = '#paneA'): Promise<void> {
  await win.locator(`${pane} .monaco-editor`).click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText(text)
}

function spellErrors(win: Page, pane = '#paneA') {
  return win.locator(`${pane} .spell-error`)
}

async function quitDirtyApp(app: ElectronApplication, win: Page): Promise<void> {
  const exited = new Promise<void>(resolve => app.process().once('exit', () => resolve()))
  await win.evaluate(() => window.api.quitNow())
  await exited
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

test('decorates exactly one plain-text misspelling after the edit debounce', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-plain-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'placeholder')
  const { app, win } = await launch(userDataDir, filePath)
  try {
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

test('does not decorate the identical word in a TypeScript buffer', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-spell-ts-'))
  const filePath = join(userDataDir, 'note.ts')
  writeFileSync(filePath, 'This is a speling mistake.')
  const { app, win } = await launch(userDataDir, filePath)
  try {
    await expect(win.locator('#paneA .view-lines')).toContainText('speling')
    await win.waitForTimeout(700)

    await expect(spellErrors(win)).toHaveCount(0)
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

    await expect(spellErrors(win)).toHaveCount(1)
    await expect(spellErrors(win)).toHaveText('speling')
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
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
