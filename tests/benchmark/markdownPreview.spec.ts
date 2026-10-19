import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test, expect } from '../smoke/smokeTest'
import { waitForBoot } from '../smoke/appReady'
import { quitViaMenu } from '../smoke/appActions'

interface Sample {
  parseMs: number
  sanitizeMs: number
  renderMs: number
  insertMs: number
  layoutMs: number
  totalMs: number
}

// Instrument ONLY a disposable copy of the built renderer. No production probes,
// altered CSP, alternate rendering engine, or synthetic replacement preview.
// Fail closed if the build shape changes, rather than silently measuring nothing.
function instrument(source: string): string {
  let renderers = 0
  source = source.replace(
    /function (renderMarkdown(?:Fragment)?)\(src\) \{\s*return (\w+)\.sanitize\(md\.render\(src\)(, \{ RETURN_DOM_FRAGMENT: true \})?\);\s*\}/g,
    (_, name: string, purifier: string, options: string | undefined) => {
      renderers++
      return `function ${name}(src) {
        const start = performance.now();
        const html = md.render(src);
        const parsed = performance.now();
        const result = ${purifier}.sanitize(html${options ?? ''});
        const sanitized = performance.now();
        globalThis.__markdownStages = { parseMs: parsed - start, sanitizeMs: sanitized - parsed };
        return result;
      }`
    },
  )
  if (renderers < 1 || renderers > 2) throw new Error(`Expected 1–2 Markdown renderers, found ${renderers}`)
  let previews = 0
  source = source.replace(/  renderNow\(markdown\) \{([\s\S]*?)\n  \}/g, (_, body: string) => {
    previews++
    return `  renderNow(markdown) {
      globalThis.__markdownStages = null;
      const started = performance.now();
      ${body}
      const inserted = performance.now();
      void this.panel.scrollHeight;
      const laidOut = performance.now();
      const stages = globalThis.__markdownStages;
      if (!stages) throw new Error('Markdown profiling stages were not reached');
      (globalThis.__markdownSamples ??= []).push({ ...stages,
        renderMs: inserted - started,
        insertMs: inserted - started - stages.parseMs - stages.sanitizeMs,
        layoutMs: laidOut - inserted,
        totalMs: laidOut - started });
    }`
  })
  if (previews !== 1) throw new Error(`Expected one preview renderer, found ${previews}`)
  return source
}

test('profile large Markdown in the real Electron preview', async ({ smoke }, testInfo) => {
  const root = smoke.tempDir('notes-markdown-profile-')
  const build = join(root, 'out')
  cpSync(resolve('out'), build, { recursive: true })
  const assets = join(build, 'renderer', 'assets')
  const candidates = readdirSync(assets).filter(name => name.endsWith('.js')).filter(name =>
    readFileSync(join(assets, name), 'utf8').includes('class MarkdownPreview {'))
  expect(candidates).toHaveLength(1)
  const asset = join(assets, candidates[0])
  writeFileSync(asset, instrument(readFileSync(asset, 'utf8')))

  const reports: Array<{ bytes: number; samples: Sample[] }> = []
  for (const kib of [50, 500]) {
    const block = '## Section\n\nA paragraph with **bold**, *emphasis*, `code` and https://example.com.\n\n'
      + '- [ ] Pending task\n- [x] Completed task\n\n| A | B |\n| --- | --- |\n| one | two |\n\n'
    const markdown = '# Profile document\n\n' + block.repeat(Math.ceil(kib * 1024 / block.length)) + '\nEND OF PROFILE\n'
    const path = join(root, `profile-${kib}.md`)
    writeFileSync(path, markdown)
    const userData = smoke.tempDir('notes-markdown-profile-user-')
    const app = await smoke.launch({ args: [join(build, 'main', 'index.js'), `--user-data-dir=${userData}`, path] })
    const win = await app.firstWindow()
    await waitForBoot(win)
    await expect(win.locator('#paneA .view-lines')).toContainText('# Profile document')
    const samples: Sample[] = []
    for (let iteration = 0; iteration < 3; iteration++) {
      await win.evaluate(() => { (globalThis as any).__markdownSamples = [] })
      await win.getByRole('button', { name: 'Choose Markdown preview mode' }).click()
      await win.getByRole('menuitemradio', { name: 'Side by side', exact: true }).click()
      await expect(win.locator('#mdpreview')).toContainText('END OF PROFILE')
      const measured = await win.evaluate(() => (globalThis as any).__markdownSamples as Sample[])
      expect(measured).toHaveLength(1)
      samples.push(measured[0])
      await win.getByRole('button', { name: 'Choose Markdown preview mode' }).click()
      await win.getByRole('menuitemradio', { name: 'Off', exact: true }).click()
    }
    reports.push({ bytes: Buffer.byteLength(markdown), samples })
    await quitViaMenu(app)
  }
  const report = JSON.stringify({ label: process.env.NC_MARKDOWN_PROFILE_LABEL ?? 'current', reports }, null, 2)
  console.log(report)
  writeFileSync(testInfo.outputPath('markdown-profile.json'), report)
  await testInfo.attach('markdown-profile.json', { body: report, contentType: 'application/json' })
})
