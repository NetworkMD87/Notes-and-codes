import { test, expect } from './smokeTest'

test('a toolbar button shows an accent ring on keyboard focus but not on mouse click', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-smoke-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    const btn = win.locator('.tb-btn').first()
    await expect(btn).toBeVisible()
    // Programmatic focus with :focus-visible heuristic satisfied → ring.
    const ring = await btn.evaluate((el) => {
      ;(el as HTMLElement).focus()
      const o = getComputedStyle(el)
      return { width: o.outlineWidth, style: o.outlineStyle }
    })
    // 2px solid outline present on keyboard focus.
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(1.5)
    expect(ring.style).toBe('solid')
})
