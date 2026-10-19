import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'
import { quitViaMenu } from './appActions'

test('Markdown preview inserts sanitized nodes and preserves editing, scroll and links', async ({ smoke }) => {
  const userData = smoke.tempDir('notes-markdown-render-')
  const path = join(userData, 'render.md')
  const source = '# Fragment preview\n\n- [ ] Pending\n- [x] Done\n\n'
    + '| A | B |\n| --- | --- |\n| café | 😀 |\n\n'
    + 'https://example.com\n\n<script>alert(1)</script>\n\n'
    + 'Paragraph with **bold** and `code`.\n\n'.repeat(120)
  writeFileSync(path, source)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userData}`, path] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  await expect(win.locator('#paneA .view-lines')).toContainText('# Fragment preview')
  const preview = win.locator('#mdpreview')
  await preview.evaluate(panel => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!
    panel.setAttribute('data-html-reparses', '0')
    Object.defineProperty(panel, 'innerHTML', {
      get: () => descriptor.get!.call(panel),
      set: value => {
        panel.setAttribute('data-html-reparses', String(Number(panel.getAttribute('data-html-reparses')) + 1))
        descriptor.set!.call(panel, value)
      },
    })
  })
  await win.getByRole('button', { name: 'Choose Markdown preview mode' }).click()
  await win.getByRole('menuitemradio', { name: 'Side by side', exact: true }).click()
  await expect(preview.locator('h1')).toHaveText('Fragment preview')
  await expect(preview.locator('tbody td')).toHaveText(['café', '😀'])
  await expect(preview.locator('input')).toHaveCount(2)
  await expect(preview.locator('input').first()).toBeDisabled()
  await expect(preview.locator('input').last()).toBeDisabled()
  await expect(preview.locator('input').last()).toBeChecked()
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview).toContainText('<script>alert(1)</script>')
  await expect(preview.locator('a')).toHaveAttribute('rel', 'noopener noreferrer')
  expect(await preview.locator('a').evaluate(anchor => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    anchor.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)

  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.press('Control+End')
  const scroll = await preview.evaluate(panel => { panel.scrollTop = 160; return panel.scrollTop })
  expect(scroll).toBeGreaterThan(0)
  await win.keyboard.insertText('\n\nUpdated preview end')
  await expect(preview.locator('p').last()).toHaveText('Updated preview end')
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true)
  expect(await preview.evaluate(panel => panel.scrollTop)).toBe(scroll)
  await expect(preview).toHaveAttribute('data-html-reparses', '0')

  await win.keyboard.press('Control+a')
  await win.keyboard.press('Backspace')
  await expect(preview.locator('h1')).toHaveCount(0)
  await expect(preview).toHaveText('')
  await win.keyboard.press('Control+z')
  await expect(preview.locator('h1')).toHaveText('Fragment preview')
  await expect(preview.locator('p').last()).toHaveText('Updated preview end')
  await expect(preview).toHaveAttribute('data-html-reparses', '0')
  // Quit only after our disposable file is saved; dirty files intentionally raise a native dialog.
  await win.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(() => readFileSync(path, 'utf8')).toBe(source + '\n\nUpdated preview end')
  await expect(win.getByRole('tab', { name: `render.md, ${path}`, exact: true })).toBeVisible()
  await quitViaMenu(app)
})
