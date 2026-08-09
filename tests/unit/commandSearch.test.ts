import { describe, expect, it, vi } from 'vitest'
import { rankCommands } from '../../src/renderer/commandSearch'
import type { Command } from '../../src/renderer/commandPalette'

const command = (id: string, label: string, hint?: string): Command => ({ id, label, hint, run: vi.fn() })

describe('rankCommands', () => {
  const commands = [
    command('settings', 'Preferences'),
    command('set-language', 'Set Language'),
    command('save-all', 'Save All', 'Ctrl+Shift+S'),
    command('toggle-sidebar', 'Toggle Sidebar'),
  ]

  it('orders exact, prefix, contiguous, then subsequence matches', () => {
    const ranked = rankCommands('settings', [
      command('settings', 'Preferences'), command('settings-extra', 'Settings Extra'),
      command('open-settings', 'Open Settings'), command('s-e-t-t-i-n-g-s', 'Scattered Entry To Toggle In New Global State'),
    ])
    expect(ranked.map(r => r.command.id)).toEqual(['settings', 'settings-extra', 'open-settings', 's-e-t-t-i-n-g-s'])
  })

  it('searches id and shortcut hint, with label/id winning an equal-strength tie', () => {
    expect(rankCommands('toggle-sidebar', commands)[0].command.label).toBe('Toggle Sidebar')
    expect(rankCommands('Ctrl+Shift+S', commands)[0].command.id).toBe('save-all')
    const tied = rankCommands('save', [command('x', 'Save'), command('save', 'Other', 'Save')])
    expect(tied.map(r => r.command.label)).toEqual(['Save', 'Other'])
  })

  it('uses registration order as the final tie-break', () => {
    const tied = [command('first', 'Alpha One'), command('second', 'Alpha Two')]
    expect(rankCommands('Alpha', tied).map(r => r.registrationIndex)).toEqual([0, 1])
  })

  it('returns registration order for an empty query', () => {
    expect(rankCommands('   ', commands).map(r => r.command.id)).toEqual(commands.map(c => c.id))
  })
})
