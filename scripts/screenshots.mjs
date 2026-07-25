/**
 * Regenerate the README screenshots.
 *
 *   npm run screenshots            # all shots
 *   npm run screenshots -- hero    # just the ones whose name contains "hero"
 *
 * Deterministic + committed, the same contract as `npm run make-icon`: re-running it on an
 * unchanged UI must leave `git status` clean, so the images can never quietly drift from the
 * app. That is the whole point — hand-captured screenshots go stale, and a stale screenshot is
 * worse than none.
 *
 * How it stays deterministic:
 *  - a throwaway `--user-data-dir` per run, seeded with an explicit settings.json + session.json,
 *    so theme / accent / font / open tabs / sidebar state are all pinned rather than inherited
 *    from whatever the developer last did;
 *  - a fixed window size and device scale factor;
 *  - a fixture workspace written fresh each run (below), so the sidebar tree is identical.
 *
 * Requires `npm run build` first — it shoots the built app in out/, not the dev server.
 */
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'assets', 'screenshots')

// Electron refuses Chromium flags when this is set (it runs as plain Node instead), which is how
// VS Code's integrated terminal breaks `electron.launch`. Clear it before we spawn anything.
delete process.env.ELECTRON_RUN_AS_NODE
// The app skips global-hotkey registration under this flag — a script that seizes an OS-level
// hotkey mid-run would be rude, and a machine already holding it would inject a conflict toast
// into the screenshots.
process.env.NC_HEADLESS = '1'

// Wide enough that a split pane still fits ~55 columns beside the sidebar — narrower and word
// wrap starts breaking the fixture mid-sentence, which looks like a rendering bug in a still.
// Height is sized so the content fills the frame; a taller window just adds empty editor, which
// reads as "this app has nothing in it" on a README.
const WIDTH = 1680
const HEIGHT = 820
// 2 = retina-crisp on GitHub, which renders README images at roughly half this width.
const SCALE = 2

// ── Fixture workspace ────────────────────────────────────────────────────────────────────────
// Original code, written for this repo (MIT, same as everything else here). Deliberately NOT a
// famous snippet: the recognisable ones — Quake III's fast inverse square root being the usual
// temptation — carry their own licences (that one is GPL-2.0), and vendoring a GPL function into
// an MIT repo's fixtures to make a joke is a bad trade.
// Lines are kept under ~48 columns on purpose: this file is shot inside a SPLIT pane, and
// anything longer gets word-wrapped mid-sentence, which reads as a rendering bug in a still.
const API_TS = `import { store } from './store'
import { remote } from './remote'
import { reconcile } from './reconcile'

export type Role = 'owner' | 'editor' | 'viewer'

export interface Member {
  id: string
  role: Role
}

export interface Workspace {
  id: string
  name: string
  updatedAt: number
  members: Member[]
}

const sleep = (ms: number) =>
  new Promise(done => setTimeout(done, ms))

/** Merge the remote workspace into local state. */
export async function syncWorkspace(id: string) {
  const local = await store.read(id)

  // HACK (2019): do not remove. Everything
  // breaks and nobody knows why. Three people
  // have tried. There is a branch named after
  // each of them.
  await sleep(50)

  const incoming = await remote.fetch(\`/v2/ws/\${id}\`)
  return reconcile(local, incoming)
}

export function membersByRole(ws: Workspace, role: Role) {
  return ws.members
    .filter(m => m.role === role)
    .map(m => m.id)
}
`

// The deep cut: the diff shot renames dataFinal2 → dataFinal3, which is the only honest way
// that variable was ever going to evolve.
const PIPELINE_BEFORE = `import { fetchUsers } from './api'
import { normalize, merge, dedupe } from './shape'

export interface Row {
  id: string
  name: string
  lastSeen: number
}

export interface Report {
  orgId: string
  rows: Row[]
  generatedAt: number
}

export async function buildReport(orgId: string) {
  const data = await fetchUsers(orgId)
  const data2 = normalize(data)
  const dataFinal = merge(data, data2)
  const dataFinal2 = dedupe(dataFinal)

  // TODO: rename these before anyone sees this
  return dataFinal2
}

export function summarize(r: Report) {
  return \`\${r.rows.length} rows\`
}
`

const PIPELINE_AFTER = `import { fetchUsers } from './api'
import { normalize, merge, dedupe, sortByName } from './shape'

export interface Row {
  id: string
  name: string
  lastSeen: number
}

export interface Report {
  orgId: string
  rows: Row[]
  generatedAt: number
}

export async function buildReport(orgId: string) {
  const data = await fetchUsers(orgId)
  const data2 = normalize(data)
  const dataFinal = merge(data, data2)
  const dataFinal2 = dedupe(dataFinal)
  const dataFinal3 = sortByName(dataFinal2)

  // TODO: rename these before anyone sees this
  return dataFinal3
}

export function summarize(r: Report) {
  return \`\${r.rows.length} rows for \${r.orgId}\`
}
`

const NOTES_MD = `# Sync notes

The workspace sync runs on a **50ms delay**
nobody has been brave enough to remove.
See \`syncWorkspace\` in \`src/api.ts\`.

## Still to do

- [x] Reconcile members on pull
- [ ] Find out what the sleep waits for
- [ ] Retry with backoff instead of hoping

> Scratch buffers survive a restart,
> so this list is safe here.
`

const THEME_CSS = `:root {
  --surface: #16181d;
  --text: #e6e6e6;
  --accent: #0a84ff;
  --radius: 10px;
}

.card {
  background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  border-radius: var(--radius);
  padding: 16px 20px;
}
`

const CONFIG_JSON = `{
  "name": "acme-workspace",
  "version": "2.4.1",
  "sync": { "intervalMs": 30000, "retries": 3 },
  "features": ["split-panes", "file-history", "highlighter"]
}
`

function writeFixtureWorkspace() {
  // The folder BASENAME is on screen (the sidebar's header caption), so it must be fixed —
  // mkdtemp's random suffix would change the image on every run and break the determinism
  // contract. Random parent dir, stable child.
  const dir = join(mkdtempSync(join(tmpdir(), 'nc-shots-ws-')), 'acme-workspace')
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'src', 'lib'), { recursive: true })
  writeFileSync(join(dir, 'src', 'api.ts'), API_TS)
  writeFileSync(join(dir, 'src', 'pipeline.ts'), PIPELINE_AFTER)
  writeFileSync(join(dir, 'src', 'theme.css'), THEME_CSS)
  writeFileSync(join(dir, 'src', 'lib', 'reconcile.ts'), 'export function reconcile<T>(a: T, b: T): T {\n  return { ...a, ...b }\n}\n')
  writeFileSync(join(dir, 'src', 'lib', 'remote.ts'), 'export const remote = {\n  fetch: async (path: string) => ({} as never),\n}\n')
  writeFileSync(join(dir, 'notes.md'), NOTES_MD)
  writeFileSync(join(dir, 'config.json'), CONFIG_JSON)
  return dir
}

// ── Seeded app state ─────────────────────────────────────────────────────────────────────────

function buffer(id, title, filePath, content, language) {
  return { id, title, filePath, content, language, eol: 'LF', encoding: 'utf8', dirty: false }
}

/**
 * Seed a user-data dir. Pinning session + settings on disk is what lets us skip every native
 * dialog: "open folder" and "open file" are OS-level and cannot be driven, but the app restores
 * both from settings/session at boot, which reaches the same state.
 */
function seedUserData({ themeId, accent, workspace, buffers, activeId, sidebar }) {
  const dir = mkdtempSync(join(tmpdir(), 'nc-shots-'))
  mkdirSync(join(dir, 'session'), { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({
    themeId,
    accent: accent ?? null,
    theme: 'dark',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    uiFontFamily: 'System',
    fontLigatures: true,
    lastFolder: sidebar ? workspace : null,
    restoreFolderOnLaunch: !!sidebar,
    sidebarVisible: !!sidebar,
    sidebarWidth: 250,
    showAllFiles: false,
    contextMenuEnabled: false,
    openAtLogin: false,
    globalHotkey: '',
    autoSaveToDisk: false,
    formatOnSave: false,
    alwaysOnTop: false,
    autoSaveSession: true,
    windowBounds: { width: WIDTH, height: HEIGHT },
  }, null, 2))
  writeFileSync(join(dir, 'session', 'session.json'), JSON.stringify({ buffers, activeId }, null, 2))
  return dir
}

async function launch(userDataDir) {
  const app = await electron.launch({
    args: [
      'out/main/index.js',
      `--user-data-dir=${userDataDir}`,
      `--force-device-scale-factor=${SCALE}`,
    ],
    cwd: ROOT,
  })
  const win = await app.firstWindow()
  await win.locator('#tabbar').waitFor({ state: 'visible' })
  await app.evaluate(async ({ BrowserWindow }, size) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setBounds({ x: 40, y: 40, width: size.w, height: size.h })
  }, { w: WIDTH, h: HEIGHT })
  // Monaco lays out asynchronously after a resize; give it a paint before we shoot.
  await win.waitForTimeout(700)
  return { app, win }
}

/**
 * Freeze everything that animates, so two runs of an unchanged UI produce byte-identical PNGs.
 *
 * Verified the hard way: without this, 6 of the 8 shots differed between consecutive runs. The
 * culprits are all caret-related — Monaco's caret blinks (and this app sets `cursorBlinking:
 * 'smooth'`, so it fades rather than toggling, giving it many possible intermediate opacities),
 * and every focused overlay input has a blinking text caret of its own. A fixed wait before
 * shooting doesn't help; it just picks an arbitrary phase.
 *
 * Injected as a stylesheet at screenshot time rather than changed in app config, so this is
 * purely a capture concern and nothing about the shipped editor's behaviour moves.
 */
async function freezeForCapture(win) {
  await win.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      .monaco-editor .cursors-layer { display: none !important; }
      input, textarea { caret-color: transparent !important; }
    `,
  })
  await win.waitForTimeout(150)
}

async function shoot(win, name) {
  await freezeForCapture(win)
  const path = join(OUT_DIR, `${name}.png`)
  await win.screenshot({ path })
  console.log(`  ✓ ${name}.png`)
}

// ── Shots ────────────────────────────────────────────────────────────────────────────────────

const WS = writeFixtureWorkspace()

const CODE_BUFFERS = (ws) => ([
  buffer('b-api', 'api.ts', join(ws, 'src', 'api.ts'), API_TS, 'typescript'),
  buffer('b-notes', 'notes.md', join(ws, 'notes.md'), NOTES_MD, 'markdown'),
  buffer('b-css', 'theme.css', join(ws, 'src', 'theme.css'), THEME_CSS, 'css'),
  buffer('b-json', 'config.json', join(ws, 'config.json'), CONFIG_JSON, 'json'),
])

/**
 * Hero staging: expand the tree so the sidebar shows its badges instead of two collapsed rows,
 * then split and put notes.md in the second pane. Split is the headline feature AND it fills a
 * frame that a 30-line file otherwise leaves two-thirds empty.
 */
async function stageHero(win) {
  await win.locator('.sb-row', { hasText: 'src' }).first().click()
  await win.waitForTimeout(250)
  await win.keyboard.press('Control+\\')
  await win.waitForTimeout(400)
  // A tab click loads the buffer into whichever pane has FOCUS, and splitting leaves focus on
  // pane A — so click into the empty pane B first, or notes.md just replaces api.ts on the left.
  await win.locator('#paneB .view-lines').click()
  await win.waitForTimeout(200)
  await win.locator('#tabbar .tab', { hasText: 'notes.md' }).first().click()
  await win.waitForTimeout(500)
  // Hand focus back to the code pane (click the PANE, not the tab — a tab click would pull
  // api.ts into pane B and undo the split we just staged) so the status bar reads typescript.
  await win.locator('#paneA .view-lines').click()
  await win.waitForTimeout(500)
}

const SHOTS = [
  // The hero: sidebar tree + four file-type badges in the tab strip + split panes + the joke.
  {
    name: 'hero-dark',
    async run() {
      const dir = seedUserData({
        themeId: 'tokyo-night', workspace: WS, sidebar: true,
        buffers: CODE_BUFFERS(WS), activeId: 'b-api',
      })
      const { app, win } = await launch(dir)
      try { await stageHero(win); await shoot(win, 'hero-dark') } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
    },
  },
  {
    name: 'hero-light',
    async run() {
      const dir = seedUserData({
        themeId: 'light', workspace: WS, sidebar: true,
        buffers: CODE_BUFFERS(WS), activeId: 'b-api',
      })
      const { app, win } = await launch(dir)
      try { await stageHero(win); await shoot(win, 'hero-light') } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
    },
  },
  // Theme range: same buffer, four themes. Proves the "13 cohesive themes" claim instead of
  // asking the reader to take it on faith.
  ...['dracula', 'nord', 'gruvbox-light', 'monokai'].map(id => ({
    name: `theme-${id}`,
    async run() {
      const dir = seedUserData({
        themeId: id, workspace: WS, sidebar: false,
        buffers: CODE_BUFFERS(WS), activeId: 'b-api',
      })
      const { app, win } = await launch(dir)
      try { await shoot(win, `theme-${id}`) } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
    },
  })),
  // The palette, with its keycap shortcut hints.
  {
    name: 'palette',
    async run() {
      const dir = seedUserData({
        themeId: 'one-dark', workspace: WS, sidebar: false,
        buffers: CODE_BUFFERS(WS), activeId: 'b-api',
      })
      const { app, win } = await launch(dir)
      try {
        await win.keyboard.press('Control+Shift+P')
        await win.locator('#palette .palette-box').waitFor({ state: 'visible' })
        await win.waitForTimeout(400)   // let the overlay entry animation settle
        await shoot(win, 'palette')
      } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
    },
  },
  // Diff, carrying the deep cut: dataFinal2 → dataFinal3.
  {
    name: 'diff',
    async run() {
      const dir = seedUserData({
        themeId: 'dark-dimmed', workspace: WS, sidebar: false,
        buffers: [
          buffer('b-old', 'pipeline.ts (HEAD)', null, PIPELINE_BEFORE, 'typescript'),
          buffer('b-new', 'pipeline.ts', join(WS, 'src', 'pipeline.ts'), PIPELINE_AFTER, 'typescript'),
        ],
        activeId: 'b-new',
      })
      const { app, win } = await launch(dir)
      try {
        await win.keyboard.press('Control+Shift+P')
        await win.locator('#palette input').fill('Start Diff (tab vs tab)')
        await win.keyboard.press('Enter')
        const picker = win.locator('.diff-picker')
        await picker.waitFor({ state: 'visible', timeout: 5000 })
        // The picker already defaults to buffers 0 and 1, which is the pairing we seeded —
        // set them explicitly anyway so the shot can't drift if that default ever changes.
        await picker.locator('select').nth(0).selectOption('b-old')
        await picker.locator('select').nth(1).selectOption('b-new')
        await picker.locator('button', { hasText: 'Compare' }).click()
        await win.waitForTimeout(900)
        await shoot(win, 'diff')
      } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
    },
  },
]

// ── Run ──────────────────────────────────────────────────────────────────────────────────────

const filter = process.argv.slice(2).find(a => !a.startsWith('-'))
const selected = filter ? SHOTS.filter(s => s.name.includes(filter)) : SHOTS

mkdirSync(OUT_DIR, { recursive: true })
console.log(`Capturing ${selected.length} shot(s) at ${WIDTH}×${HEIGHT} @${SCALE}x → assets/screenshots/`)

try {
  for (const shot of selected) {
    try {
      await shot.run()
    } catch (err) {
      console.error(`  ✗ ${shot.name} failed: ${err.message}`)
      process.exitCode = 1
    }
  }
} finally {
  rmSync(WS, { recursive: true, force: true })
}
