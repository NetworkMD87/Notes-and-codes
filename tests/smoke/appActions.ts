import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitForBoot } from './appReady'

/** Run a palette command only after its exact label is the selected result. */
export async function runPaletteCommand(win: Page, label: string): Promise<void> {
  await waitForBoot(win)
  await win.keyboard.press('Control+Shift+P')
  const palette = win.getByRole('dialog', { name: 'Command Palette' })
  const input = palette.getByRole('combobox', { name: 'Command Palette' })
  await input.fill(label)
  const selected = palette.locator('[role="option"][aria-selected="true"]')
  await expect(selected).toHaveCount(1)
  await expect(selected.locator('span').first()).toHaveText(label)
  await expect(selected).toHaveAttribute('id', /^palette-option-/)
  await expect(input).toHaveAttribute('aria-activedescendant', (await selected.getAttribute('id'))!)
  await input.press('Enter')
  await expect(palette).toBeHidden()
}

export async function expectPersistedSettings(userDataDir: string, expected: Record<string, unknown>): Promise<void> {
  await expect.poll(() => {
    try { return JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }, { message: 'Changed settings must reach disk before restart' }).toMatchObject(expected)
}

/** Successful clean shutdown uses the renderer's flush path; the fixture owns failure cleanup. */
export async function quitViaMenu(app: ElectronApplication): Promise<void> {
  const child = app.process()
  const closed = app.waitForEvent('close', { timeout: 10_000 })
  await Promise.all([
    closed,
    app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
      file.submenu!.items.find(item => item.label === 'Exit')!.click()
    }).catch(async () => { await closed }),
  ])
  await expect.poll(() => child.exitCode, { timeout: 10_000 }).toBe(0)
}
