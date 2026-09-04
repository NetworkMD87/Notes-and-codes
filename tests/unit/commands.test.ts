import { describe, expect, it, vi } from 'vitest'
import { registerCommands, type CommandDeps } from '../../src/renderer/commands'

describe('Markdown commands', () => {
  it('registers every Markdown formatting action and routes each one to the focused editor', () => {
    const registered: Array<{ id: string; label: string; run: () => void }> = []
    const applyMarkdown = vi.fn()
    const deps = {
      palette: { register: (command: { id: string; label: string; run: () => void }) => registered.push(command) },
      applyMarkdown,
    } as unknown as CommandDeps

    registerCommands(deps)

    const markdown = registered.filter(command => command.id.startsWith('markdown-'))
    expect(markdown.map(command => command.label)).toEqual([
      'Markdown: Heading', 'Markdown: Bold', 'Markdown: Italic', 'Markdown: Link',
      'Markdown: Inline code', 'Markdown: Code block', 'Markdown: Quote',
      'Markdown: Bulleted list', 'Markdown: Numbered list', 'Markdown: Task list',
    ])
    markdown[1].run()
    expect(applyMarkdown).toHaveBeenCalledWith('bold')
  })
})
