import { afterEach, expect, it, vi } from 'vitest'
import {
  MAX_SESSION_SAVE_TEST_DELAY_MS,
  QUIT_FLUSH_WATCHDOG_MARGIN_MS,
  startQuitFlushWatchdog,
} from '../../src/main/quitFlushWatchdog'

afterEach(() => { vi.useRealTimers() })

it('keeps the quit fallback dormant through two maximum serialized session writes plus margin', async () => {
  vi.useFakeTimers()
  const onTimeout = vi.fn()
  startQuitFlushWatchdog(onTimeout)

  await vi.advanceTimersByTimeAsync(MAX_SESSION_SAVE_TEST_DELAY_MS * 2)
  expect(onTimeout).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(QUIT_FLUSH_WATCHDOG_MARGIN_MS - 1)
  expect(onTimeout).not.toHaveBeenCalled()

  await vi.advanceTimersByTimeAsync(1)
  expect(onTimeout).toHaveBeenCalledTimes(1)
})
