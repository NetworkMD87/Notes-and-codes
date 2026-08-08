import { test as base, expect } from '@playwright/test'
import {
  SmokeResources,
  classifyCleanup,
  type CleanupIssue,
} from './smokeCleanup'

export { expect }

export async function reportCleanup(
  issues: CleanupIssue[],
  bodyError: unknown,
  attach: (name: string, body: string) => Promise<void>,
  writeDiagnostic: (message: string) => void,
): Promise<void> {
  const disposition = classifyCleanup(issues, bodyError)
  if (!disposition.diagnostic) return

  let attachmentError: Error | undefined
  try {
    await attach('smoke-cleanup.txt', disposition.diagnostic)
  } catch (error) {
    attachmentError = error instanceof Error ? error : new Error('Unknown attachment failure')
  }

  const diagnostic = attachmentError
    ? `${disposition.diagnostic}\nSmoke cleanup attachment failed: ${attachmentError.message}`
    : disposition.diagnostic
  writeDiagnostic(diagnostic)

  if (!disposition.throwError) return
  if (!attachmentError) throw disposition.throwError
  throw new AggregateError([...disposition.throwError.errors, attachmentError], diagnostic)
}

export const test = base.extend<{ smoke: SmokeResources }>({
  smoke: async ({}, use, testInfo) => {
    const smoke = new SmokeResources()
    let useError: unknown
    try {
      await use(smoke)
    } catch (error) {
      useError = error
      throw error
    } finally {
      const issues = await smoke.cleanup()
      const bodyError = useError ?? testInfo.errors[0]
      await reportCleanup(
        issues,
        bodyError,
        async (name, body) => testInfo.attach(name, { body, contentType: 'text/plain' }),
        message => console.error(message),
      )
    }
  },
})
