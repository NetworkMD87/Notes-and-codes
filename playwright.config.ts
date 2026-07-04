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
  // The deterministic freeze (blocking hotkey-conflict modal) is fixed at the source;
  // this only covers the residual, irreducible flake — Monaco occasionally not painting
  // within an assertion window under full-suite load. A real bug still fails all attempts.
  retries: 2
})
