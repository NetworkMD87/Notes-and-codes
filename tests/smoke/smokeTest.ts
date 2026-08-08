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

  await attach('smoke-cleanup.txt', disposition.diagnostic)
  writeDiagnostic(disposition.diagnostic)
  if (disposition.throwError) throw disposition.throwError
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
