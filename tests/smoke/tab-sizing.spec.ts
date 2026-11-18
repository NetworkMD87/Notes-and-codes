import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'
import { openSettings } from './settingsHelper'

test('long filenames are bounded by default and Natural width remains available', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-tab-sizing-')
  const filename = `${'very-long-descriptive-filename-'.repeat(3)}notes.ts`
  const filePath = join(userDataDir, filename)
  writeFileSync(filePath, 'export const answer = 42')
  const app = await smoke.launch({
    args: ['out/main/index.js', '--hidden', filePath, `--user-data-dir=${userDataDir}`],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  const tab = win.locator('.tab').first()
  const title = tab.locator('.tab-title')
  const select = tab.locator('.tab-select')
  await win.setViewportSize({ width: 800, height: 600 })
  const narrowWidth = await tab.evaluate(element => element.getBoundingClientRect().width)
  await win.setViewportSize({ width: 1400, height: 800 })
  const bounded = await tab.evaluate(element => ({
    width: element.getBoundingClientRect().width,
    closeShrink: getComputedStyle(element.querySelector('.tab-close')!).flexShrink,
    badgeShrink: getComputedStyle(element.querySelector('.badge')!).flexShrink,
  }))
  expect(narrowWidth).toBeCloseTo(101, 0)
  expect(bounded.width).toBeCloseTo(168, 0)
  expect(bounded.width).toBeGreaterThan(narrowWidth)
  expect(bounded.closeShrink).toBe('0')
  expect(bounded.badgeShrink).toBe('0')
  await expect(title).toHaveCSS('text-overflow', 'ellipsis')
  expect(await title.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await expect(select).toHaveAttribute('title', filePath)
  await expect(select).toHaveAttribute('aria-label', `${filename}, ${filePath}`)

  await openSettings(win, 'Appearance')
  const sizing = win.getByRole('button', { name: 'Tab sizing' })
  await expect(sizing).toContainText('Bounded')
  await expect(sizing).toHaveAttribute('aria-expanded', 'false')
  await sizing.click()
  await expect(sizing).toHaveAttribute('aria-expanded', 'true')
  const sizingOptions = win.getByRole('listbox', { name: 'Tab sizing' })
  await expect(sizingOptions).toBeVisible()
  const optionTheme = await sizingOptions.evaluate(element => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;background:var(--bar);color:var(--panel-text)'
    document.body.appendChild(probe)
    const actual = getComputedStyle(element)
    const expected = getComputedStyle(probe)
    const colours = {
      background: actual.backgroundColor,
      foreground: actual.color,
      expectedBackground: expected.backgroundColor,
      expectedForeground: expected.color,
    }
    probe.remove()
    return colours
  })
  expect(optionTheme.background).toBe(optionTheme.expectedBackground)
  expect(optionTheme.foreground).toBe(optionTheme.expectedForeground)
  await win.getByRole('option', { name: 'Natural width' }).click()
  await expect(win.locator('#tabbar')).toHaveAttribute('data-tab-sizing', 'natural')
  const natural = await tab.evaluate(element => {
    const clone = element.cloneNode(true) as HTMLElement
    clone.style.cssText = 'position:fixed;visibility:hidden;flex:none;width:max-content;min-width:0;max-width:none'
    document.body.appendChild(clone)
    const intrinsicWidth = clone.getBoundingClientRect().width
    clone.remove()
    return { width: element.getBoundingClientRect().width, intrinsicWidth }
  })
  expect(natural.width).toBeGreaterThan(168)
  expect(natural.width).toBeCloseTo(natural.intrinsicWidth, 0)
  await expect.poll(
    () => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).tabSizing,
  ).toBe('natural')
  await win.keyboard.press('Escape')
  await win.setViewportSize({ width: 480, height: 600 })
  await expect(win.getByRole('button', { name: 'More actions' })).toBeVisible()
  const fitsTabStrip = await tab.evaluate(element => {
    const tab = element.getBoundingClientRect()
    const strip = element.parentElement!.getBoundingClientRect()
    return tab.width > 168 && tab.left >= strip.left - 1 && tab.right <= strip.right + 1
  })
  expect(fitsTabStrip).toBe(true)
  await expect(select).toHaveAttribute('aria-label', `${filename}, ${filePath}`)
})

test('compact Natural width keeps the filename visible beside a long duplicate folder name', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-tab-natural-duplicate-')
  const folder = smoke.tempDir('notes-tab-natural-folder-')
  const buffers = ['a', 'b'].map(id => {
    const directory = join(folder, `${id}-${'long-folder-'.repeat(10)}`)
    mkdirSync(directory)
    const filePath = join(directory, 'note.txt')
    writeFileSync(filePath, id)
    return {
      id, title: 'note.txt', filePath, content: id, language: 'plaintext',
      eol: 'LF', encoding: 'utf8', dirty: false,
    }
  })
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ tabSizing: 'natural' }))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({ buffers, activeId: 'b' }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  await win.setViewportSize({ width: 480, height: 600 })
  const active = win.locator('.tab.active')
  await expect(active.locator('.tab-folder')).toBeVisible()
  const widths = await active.evaluate(tab => ({
    title: tab.querySelector('.tab-title')!.getBoundingClientRect().width,
    folder: tab.querySelector('.tab-folder')!.getBoundingClientRect().width,
    label: tab.querySelector('.tab-label')!.getBoundingClientRect().width,
  }))
  expect(widths.title).toBeGreaterThan(20)
  expect(widths.folder).toBeLessThanOrEqual(widths.label * 0.4 + 1)
  await expect(active.getByRole('tab')).toHaveAttribute('aria-label', `note.txt, ${buffers[1].filePath}`)
})
