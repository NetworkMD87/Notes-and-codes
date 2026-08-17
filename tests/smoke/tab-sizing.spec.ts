import { readFileSync, writeFileSync } from 'node:fs'
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
    args: ['out/main/index.js', filePath, `--user-data-dir=${userDataDir}`],
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
  await expect(select).toHaveAttribute('title', filename)
  await expect(select).toHaveAttribute('aria-label', filename)

  await openSettings(win, 'Appearance')
  const sizing = win.getByLabel('Tab sizing')
  await expect(sizing).toHaveValue('bounded')
  await sizing.selectOption('natural')
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
})
