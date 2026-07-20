import { describe, it, expect } from 'vitest'
import { buildContextMenuPlan } from '../../src/main/contextMenu'

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
