import { describe, expect, it, vi } from 'vitest'
import { installHeadlessNetworkBlock } from '../../src/main/headlessNetworkBlock'

describe('headless network block', () => {
  it.each([
    [{ NC_HEADLESS: '1' }, false],
    [{ NC_TEST_BLOCK_NETWORK: '1' }, false],
    [{ NC_HEADLESS: '1', NC_TEST_BLOCK_NETWORK: '1' }, true],
  ] as const)('requires both dedicated test flags: %j', (env, armed) => {
    const onBeforeRequest = vi.fn()
    const attempts: string[] = []

    expect(installHeadlessNetworkBlock(env, { onBeforeRequest }, attempts)).toBe(armed)
    expect(onBeforeRequest).toHaveBeenCalledTimes(armed ? 1 : 0)
  })

  it('records and cancels HTTP requests while allowing local renderer assets', () => {
    let listener!: (details: { url: string }, callback: (result: { cancel?: boolean }) => void) => void
    const attempts: string[] = []
    installHeadlessNetworkBlock(
      { NC_HEADLESS: '1', NC_TEST_BLOCK_NETWORK: '1' },
      { onBeforeRequest: callback => { listener = callback } },
      attempts,
    )
    const external = vi.fn()
    const local = vi.fn()

    listener({ url: 'https://example.test/private' }, external)
    listener({ url: 'file:///renderer/index.html' }, local)

    expect(attempts).toEqual(['https://example.test/private'])
    expect(external).toHaveBeenCalledWith({ cancel: true })
    expect(local).toHaveBeenCalledWith({})
  })
})
