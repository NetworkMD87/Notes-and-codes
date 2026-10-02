import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'

test('typing with 100 open tabs preserves tab nodes, scroll, and editor focus', async ({ smoke }, testInfo) => {
  const userDataDir = smoke.tempDir('notes-tab-typing-')
  mkdirSync(join(userDataDir, 'session'))
  const buffers = Array.from({ length: 100 }, (_, index) => ({
    id: `tab-${index}`,
    title: `note-${String(index).padStart(3, '0')}.txt`,
    filePath: null,
    content: `Initial content for tab ${index}`,
    language: 'plaintext',
    eol: 'LF',
    encoding: 'utf8',
    dirty: false,
  }))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({ buffers, activeId: 'tab-0' }))

  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)

  const tablist = win.getByRole('tablist', { name: 'Open files' })
  await expect(tablist.getByRole('tab')).toHaveCount(100)
  const editor = win.locator('#paneA textarea.inputarea')
  await expect(editor).toBeVisible()

  const startingScroll = await tablist.evaluate(element => {
    element.scrollLeft = element.scrollWidth
    return { left: element.scrollLeft, max: element.scrollWidth - element.clientWidth }
  })
  expect(startingScroll.max).toBeGreaterThan(0)
  expect(startingScroll.left).toBeGreaterThan(0)
  await editor.focus()

  await tablist.evaluate(element => {
    const tabs = Array.from(element.querySelectorAll<HTMLElement>('.tab'))
    const observer = new MutationObserver(records => {
      const state = (window as typeof window & { __p1TabMutationState?: { records: number; added: number; removed: number } }).__p1TabMutationState!
      state.records += records.length
      for (const record of records) {
        state.added += Array.from(record.addedNodes).filter(node => node instanceof HTMLElement && node.classList.contains('tab')).length
        state.removed += Array.from(record.removedNodes).filter(node => node instanceof HTMLElement && node.classList.contains('tab')).length
      }
    })
    ;(window as typeof window & { __p1TabTypingState?: unknown }).__p1TabTypingState = { tabs, observer }
    ;(window as typeof window & { __p1TabMutationState?: { records: number; added: number; removed: number } }).__p1TabMutationState = { records: 0, added: 0, removed: 0 }
    observer.observe(element, { childList: true })
  })

  const started = Date.now()
  await win.keyboard.type('x'.repeat(30))
  const typingMs = Date.now() - started
  await expect(tablist.getByRole('tab', { name: 'note-000.txt' }).locator('.tab-title')).toContainText('●')
  await win.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const result = await tablist.evaluate(element => {
    const state = (window as typeof window & {
      __p1TabTypingState: { tabs: HTMLElement[]; observer: MutationObserver }
      __p1TabMutationState: { records: number; added: number; removed: number }
    })
    state.__p1TabTypingState.observer.disconnect()
    const currentTabs = Array.from(element.querySelectorAll<HTMLElement>('.tab'))
    return {
      retainedNodes: state.__p1TabTypingState.tabs.filter((tab, index) => tab === currentTabs[index]).length,
      tabCount: currentTabs.length,
      scrollLeft: element.scrollLeft,
      mutations: state.__p1TabMutationState,
    }
  })
  const metrics = {
    typingMs,
    startingScroll: startingScroll.left,
    endingScroll: result.scrollLeft,
    retainedNodes: result.retainedNodes,
    tabCount: result.tabCount,
    tabMutations: result.mutations,
  }
  await testInfo.attach('tab-typing-metrics.json', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  })
  console.log(`P1 tab typing metrics: ${JSON.stringify(metrics)}`)

  expect(result.retainedNodes).toBe(100)
  expect(result.mutations.added).toBe(0)
  expect(result.mutations.removed).toBe(0)
  expect(result.scrollLeft).toBe(startingScroll.left)
  await expect(editor).toBeFocused()
  await expect(tablist.getByRole('tab', { name: 'note-000.txt' })).toHaveAttribute('aria-selected', 'true')
})
