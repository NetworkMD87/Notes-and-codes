import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SearchResponse } from '../../src/shared/types'

test('the search:files channel returns matches from the folder', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-search-'))
  const folder = mkdtempSync(join(tmpdir(), 'notes-searchdir-'))
  mkdirSync(join(folder, 'sub'))
  writeFileSync(join(folder, 'a.txt'), 'has a needle here')
  writeFileSync(join(folder, 'sub', 'b.txt'), 'needle again')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const res = await win.evaluate((root) => window.api.searchFiles({
      root, query: 'needle',
      opts: { caseSensitive: false, wholeWord: false },
      skipPaths: [], showAll: false, searchId: 1,
    }), folder) as SearchResponse
    expect(res.totalMatches).toBe(2)
    expect(res.files).toHaveLength(2)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(folder, { recursive: true, force: true })
  }
})
