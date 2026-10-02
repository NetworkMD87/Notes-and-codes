import { describe, expect, it } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'
import { formatBufferIfCurrent } from '../../src/renderer/bufferFormatting'

describe('background save formatting', () => {
  it('publishes formatted content only while the originating buffer is unchanged', async () => {
    const manager = new BufferManager(() => 'a')
    const buffer = manager.create({ content: 'const x=1', language: 'javascript' })
    expect(await formatBufferIfCurrent(manager, buffer, async () => 'const x = 1;')).toBe(true)
    expect(buffer.content).toBe('const x = 1;')
    expect(buffer.dirty).toBe(true)
  })

  it.each(['edit', 'reload', 'language', 'close'] as const)('does not overwrite an intervening %s', async change => {
    const manager = new BufferManager(() => 'a')
    const buffer = manager.create({ content: 'const x=1', language: 'javascript' })
    let finish!: (text: string) => void
    const pending = formatBufferIfCurrent(manager, buffer, () => new Promise(resolve => { finish = resolve }))
    if (change === 'edit') manager.update(buffer.id, 'newer edit')
    if (change === 'reload') buffer.content = 'new disk content'
    if (change === 'language') manager.setLanguage(buffer.id, 'plaintext')
    if (change === 'close') manager.close(buffer.id)
    const expectedContent = buffer.content
    finish('stale formatted content')
    expect(await pending).toBe(false)
    expect(buffer.content).toBe(expectedContent)
  })
})
