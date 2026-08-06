import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}
const notices = readFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8')

describe('offline spell assets', () => {
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
      expect(notices).toContain(readFileSync(resolve(root, 'node_modules', packageName, 'license'), 'utf8').trim())
    }
  })

  it.each(['dictionary-en', 'dictionary-en-gb'])('ships raw Hunspell assets for %s', (packageName) => {
    expect(existsSync(resolve(root, 'node_modules', packageName, 'index.aff'))).toBe(true)
    expect(existsSync(resolve(root, 'node_modules', packageName, 'index.dic'))).toBe(true)
  })
})
