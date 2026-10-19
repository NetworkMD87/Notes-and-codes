import { defineConfig } from '@playwright/test'
import smokeConfig from './playwright.config'

// Explicit local profiling only; kept outside the ordinary smoke/unit suites.
export default defineConfig(smokeConfig, {
  testDir: 'tests/benchmark',
  testMatch: 'markdownPreview.spec.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
})
