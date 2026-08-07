import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}
const notices = readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')
const mainSource = readFileSync(resolve(root, 'src/main/index.ts'), 'utf8')
const rendererSource = readFileSync(resolve(root, 'src/renderer/main.ts'), 'utf8')

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function containsWholeLicence(noticeText: string, licenceText: string): boolean {
  return normalizeLineEndings(noticeText).includes(normalizeLineEndings(licenceText).trim())
}

describe('offline spell assets', () => {
  it('matches full licence text across Windows and Unix line endings', () => {
    const noticeText = 'header\r\n\r\nline one\r\nline two\r\nfooter'
    const licenceText = 'line one\nline two'

    expect(containsWholeLicence(noticeText, licenceText)).toBe(true)
  })

  it('locks every runtime package and records its licence notice', () => {
    expect(lock.packages['node_modules/nspell']?.version).toBe('2.1.5')
    expect(lock.packages['node_modules/dictionary-en']?.version).toBe('4.0.0')
    expect(lock.packages['node_modules/dictionary-en-gb']?.version).toBe('3.0.0')

    expect(notices).toContain('## nspell 2.1.5 — MIT License')
    expect(notices).toContain('## dictionary-en 4.0.0 — MIT License AND BSD License')
    expect(notices).toContain('## dictionary-en-gb 3.0.0 — MIT License AND BSD License')
  })

  it('reproduces both installed dictionary licences verbatim', () => {
    for (const packageName of ['dictionary-en', 'dictionary-en-gb']) {
      const licence = readFileSync(resolve(root, 'node_modules', packageName, 'license'), 'utf8')
      expect(containsWholeLicence(notices, licence)).toBe(true)
    }
  })

  it.each(['dictionary-en', 'dictionary-en-gb'])('ships raw Hunspell assets for %s', (packageName) => {
    expect(existsSync(resolve(root, 'node_modules', packageName, 'index.aff'))).toBe(true)
    expect(existsSync(resolve(root, 'node_modules', packageName, 'index.dic'))).toBe(true)
  })

  it('keeps the renderer spell-test seam behind the NC_HEADLESS navigation flag', () => {
    expect(mainSource).toContain("if (process.env.NC_HEADLESS) headlessQuery['nc-headless'] = '1'")
    expect(rendererSource).toMatch(/spellTestParams\.get\(['"]nc-headless['"]\)\s*===\s*['"]1['"]/)
    expect(rendererSource).toContain('exposeSpellTestHooks(spellTestParams, worker, window)')
    expect(rendererSource).not.toContain('window.__ncSpellTest =')
  })
})
