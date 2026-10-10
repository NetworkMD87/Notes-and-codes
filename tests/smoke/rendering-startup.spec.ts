import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { smokeLaunchOptions } from './smokeCleanup'
import { waitForBoot } from './appReady'

for (const mode of ['disable-gpu', 'swiftshader']) {
  for (const openFile of [false, true]) {
    test(`${mode}: ${openFile ? 'explicit file' : 'blank'} startup preserves document identity`, async ({ smoke }) => {
      const userDataDir = smoke.tempDir('notes-rendering-startup-')
      const filePath = join(userDataDir, 'requested.txt')
      if (openFile) writeFileSync(filePath, 'requested startup content')
      const args = ['out/main/index.js', `--user-data-dir=${userDataDir}`]
      if (openFile) args.push(filePath)
      const app = await smoke.launch(smokeLaunchOptions({ args }, mode))
      const win = await app.firstWindow()
      await waitForBoot(win)
      const runtime = await app.evaluate(({ app }, mode) => ({
        entry: process.argv[1],
        switchApplied: mode === 'disable-gpu'
          ? app.commandLine.hasSwitch('disable-gpu')
          : app.commandLine.getSwitchValue('use-angle') === 'swiftshader' &&
            app.commandLine.getSwitchValue('use-gl') === 'angle',
      }), mode)
      expect(runtime.entry.replaceAll('\\', '/')).toMatch(/out\/main\/index\.js$/)
      expect(runtime.switchApplied).toBe(true)
      await expect(win.locator('.tab')).toHaveCount(1)
      await expect(win.locator('.tab.active')).toContainText(openFile ? 'requested.txt' : 'Untitled-1')
      await expect(win.locator('.tab')).not.toContainText('index.js')
      if (openFile) await expect(win.locator('#paneA .view-lines')).toContainText('requested startup content')
      else expect(await win.locator('#paneA .view-lines').innerText()).toBe('')
    })
  }
}
