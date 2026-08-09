export const MAX_SESSION_SAVE_TEST_DELAY_MS = 1000
export const QUIT_FLUSH_WATCHDOG_MARGIN_MS = 1500
export const QUIT_FLUSH_WATCHDOG_MS = MAX_SESSION_SAVE_TEST_DELAY_MS * 2
  + QUIT_FLUSH_WATCHDOG_MARGIN_MS

export function startQuitFlushWatchdog(onTimeout: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(onTimeout, QUIT_FLUSH_WATCHDOG_MS)
}
