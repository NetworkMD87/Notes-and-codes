import { test, expect } from './smokeTest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitForBoot } from './appReady'

test('startup open received before session load completes remains active after boot', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-startup-open-')
  const filePath = join(userDataDir, 'startup.txt')
  writeFileSync(filePath, 'startup file content')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })

    const win = await app.firstWindow()
    await waitForBoot(win)

    await app.evaluate(({ BrowserWindow, ipcMain }) => {
      const testState = globalThis as typeof globalThis & {
        releaseStartupSessionLoad?: () => void
      }
      ipcMain.removeHandler('session:load')
      ipcMain.handle('session:load', () => new Promise(resolve => {
        testState.releaseStartupSessionLoad = () => resolve({
          buffers: [{
            id: 'restored',
            title: 'Restored',
            filePath: null,
            content: 'restored session content',
            language: 'plaintext',
            eol: 'LF',
            encoding: 'utf8',
            dirty: false,
          }],
          activeId: 'restored',
        })
      }))
      BrowserWindow.getAllWindows()[0].webContents.reload()
    })

    await expect.poll(() => app.evaluate(() => Boolean(
      (globalThis as typeof globalThis & { releaseStartupSessionLoad?: () => void })
        .releaseStartupSessionLoad,
    ))).toBe(true)

    await app.evaluate(({ BrowserWindow }, path) => {
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', path)
    }, filePath)

    await expect.poll(() => win.evaluate(() =>
      document.body.dataset.startupOpenDisposition,
    )).toMatch(/^(queued|immediate)$/)
    const disposition = await win.evaluate(() => document.body.dataset.startupOpenDisposition)
    if (disposition === 'immediate') {
      await expect(win.locator('.tab', { hasText: 'startup.txt' })).toBeVisible()
    }

    await app.evaluate(() => {
      const testState = globalThis as typeof globalThis & {
        releaseStartupSessionLoad?: () => void
      }
      testState.releaseStartupSessionLoad?.()
      delete testState.releaseStartupSessionLoad
    })

    await waitForBoot(win)
    await expect(win.locator('#paneA .view-lines')).toContainText('startup file content')
    await expect(win.locator('.tab.active')).toContainText('startup.txt')
})
