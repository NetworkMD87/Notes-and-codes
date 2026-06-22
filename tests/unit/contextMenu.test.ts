import { describe, it, expect } from 'vitest'
import { buildContextMenuPlan } from '../../src/main/contextMenu'

describe('buildContextMenuPlan', () => {
  it('produces HKCU paths and a command that passes the file as %1', () => {
    const plan = buildContextMenuPlan('C:\\Apps\\Notes & Codes\\Notes-and-codes.exe')
    expect(plan.keyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes')
    expect(plan.commandKeyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes\\command')
    expect(plan.label).toBe('Open with Notes & Codes')
    expect(plan.command).toBe('"C:\\Apps\\Notes & Codes\\Notes-and-codes.exe" "%1"')
  })
})
