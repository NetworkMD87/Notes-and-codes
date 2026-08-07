export interface ElectronAppCloseTarget {
  close(): Promise<void>
  process(): { kill(): boolean }
}

export const ELECTRON_CLOSE_TIMEOUT_MS = 5_000

const closes = new WeakMap<ElectronAppCloseTarget, Promise<void>>()

export function closeElectronApp(
  app: ElectronAppCloseTarget,
  timeoutMs = ELECTRON_CLOSE_TIMEOUT_MS,
): Promise<void> {
  const existing = closes.get(app)
  if (existing) return existing

  const closing = closeOnce(app, timeoutMs)
  closes.set(app, closing)
  return closing
}

async function closeOnce(app: ElectronAppCloseTarget, timeoutMs: number): Promise<void> {
  let closePromise: Promise<void>
  try {
    closePromise = app.close()
  } catch (error) {
    closePromise = Promise.reject(error)
  }

  const closeAttempt = closePromise.then(
    () => ({ kind: 'closed' as const }),
    error => ({ kind: 'error' as const, error }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<{ kind: 'timeout' }>(resolve => {
    timer = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs)
  })

  const outcome = await Promise.race([closeAttempt, deadline])
  if (timer !== undefined) clearTimeout(timer)

  if (outcome.kind === 'timeout') {
    app.process().kill()
    return
  }
  if (outcome.kind === 'error') throw outcome.error
}
