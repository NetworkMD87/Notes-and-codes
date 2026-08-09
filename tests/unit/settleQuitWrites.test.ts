import { expect, it, vi } from 'vitest'
import { settleQuitWrites } from '../../src/renderer/settleQuitWrites'

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

it('waits for every quit write before reporting an unrelated rejection', async () => {
  const sessionWrite = deferred()
  const clipboardFailure = new Error('clipboard denied')
  const clipboardWrite = Promise.reject(clipboardFailure)
  const onRejected = vi.fn()
  let settled = false

  const settling = settleQuitWrites([clipboardWrite, sessionWrite.promise], onRejected)
    .then(() => { settled = true }, () => { settled = true })
  await new Promise(resolve => setTimeout(resolve, 0))

  expect(settled).toBe(false)
  expect(onRejected).not.toHaveBeenCalled()

  sessionWrite.resolve()
  await settling

  expect(onRejected).toHaveBeenCalledTimes(1)
  expect(onRejected).toHaveBeenCalledWith(clipboardFailure)
})
