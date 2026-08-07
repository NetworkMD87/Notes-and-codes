import { afterEach, describe, expect, test, vi } from 'vitest'
import { closeElectronApp } from '../smoke/closeElectronApp'

describe('closeElectronApp', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('settles and kills only its application process when graceful close never resolves', async () => {
    vi.useFakeTimers()
    const close = vi.fn(() => new Promise<void>(() => {}))
    const kill = vi.fn(() => true)
    const process = vi.fn(() => ({ kill }))
    const app = { close, process }

    const first = closeElectronApp(app, 25)
    const second = closeElectronApp(app, 25)
    const outcome = Promise.race([
      first.then(() => 'settled' as const),
      new Promise<'stuck'>(resolve => setTimeout(() => resolve('stuck'), 26)),
    ])

    await vi.advanceTimersByTimeAsync(26)
    expect(await outcome).toBe('settled')
    expect(close).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)
    expect(process).toHaveBeenCalledTimes(1)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  test('clears its fallback timer after graceful close', async () => {
    vi.useFakeTimers()
    const close = vi.fn().mockResolvedValue(undefined)
    const kill = vi.fn(() => true)
    const app = { close, process: vi.fn(() => ({ kill })) }

    await expect(closeElectronApp(app, 25)).resolves.toBeUndefined()

    expect(kill).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
