import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('IPC registration security boundary', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/main/ipc.ts'), 'utf8')

  it('registers search cancellation through the guarded local on wrapper', () => {
    expect(source).toContain("on('search:cancel'")
    expect(source).not.toMatch(/ipcMain\.on\(['"]search:cancel/)
  })
})
