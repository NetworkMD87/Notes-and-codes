import { describe, it, expect } from 'vitest'
import { buildContextMenuPlan, contextMenuAction } from '../../src/main/contextMenu'

describe('buildContextMenuPlan', () => {
  it('produces HKCU paths and a command that passes the file as %1', () => {
    const plan = buildContextMenuPlan('C:\\Apps\\Notes & Codes\\Notes-and-codes.exe')
    expect(plan.keyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes')
    expect(plan.commandKeyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes\\command')
    expect(plan.label).toBe('Open with Notes & Codes')
    expect(plan.command).toBe('"C:\\Apps\\Notes & Codes\\Notes-and-codes.exe" "%1"')
    expect(plan.icon).toBe('"C:\\Apps\\Notes & Codes\\Notes-and-codes.exe",0')
  })

  it('formats the icon value as a quoted exe path plus the first resource index', () => {
    const plan = buildContextMenuPlan('C:\\Apps\\N&C\\app.exe')
    expect(plan.icon).toBe('"C:\\Apps\\N&C\\app.exe",0')
  })
})

// The gate that keeps a DEV run from touching the developer's real HKCU shell integration.
// Pure + DI'd (the caller passes app.isPackaged) — same shape as pickFileArg / shouldStartHidden,
// and the only way to cover this without a test that actually writes to the registry.
describe('contextMenuAction', () => {
  it('writes when packaged and the user enables the entry', () => {
    expect(contextMenuAction(true, true)).toEqual({ kind: 'write' })
  })

  it('writes when packaged and the user disables the entry', () => {
    expect(contextMenuAction(false, true)).toEqual({ kind: 'write' })
  })

  it('skips an enable in a dev run — it would register electron.exe as the handler', () => {
    const action = contextMenuAction(true, false)
    expect(action.kind).toBe('skip')
    expect(action.kind === 'skip' && action.notice).toMatch(/installed app/i)
  })

  it('skips a DISABLE in a dev run — reg delete would remove the real installed entry', () => {
    const action = contextMenuAction(false, false)
    expect(action.kind).toBe('skip')
    expect(action.kind === 'skip' && action.notice).toMatch(/installed app/i)
  })
})
