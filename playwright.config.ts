import { defineConfig } from '@playwright/test'

// The global summon hotkey + tray are OS-level singletons that can't be automated and,
// worse, a machine already holding the hotkey injects a conflict toast into unrelated
// tests. Signal the built app to skip global-hotkey registration under smoke. Set here
// (before workers spawn) so every electron.launch inherits it; the hotkey-conflict spec
// strips it to exercise the real path.
process.env.NC_HEADLESS ??= '1'

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30000,
  fullyParallel: false,
  // Monaco's cold render (Electron boot + 6.7MB bundle + open file + paint) legitimately
  // exceeds the 5s web-default under full-suite load, so content assertions like
  // toContainText('const x = (') flaked with Received:"". Give them realistic headroom.
  expect: { timeout: 10000 },
  // The deterministic freeze (blocking hotkey-conflict modal) is fixed at the source;
  // retries only cover the residual, irreducible render-timing jitter. A real bug still
  // fails all attempts (as the two stale-assertion bugs did before they were fixed).
  retries: 2
})
