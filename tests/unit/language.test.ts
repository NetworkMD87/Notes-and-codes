import { describe, it, expect } from 'vitest'
import { languageFromPath } from '../../src/shared/language'

describe('languageFromPath', () => {
  it('maps .ts to typescript', () => {
    expect(languageFromPath('foo.ts')).toBe('typescript')
  })

  it('maps .JSON (uppercase) to json', () => {
    expect(languageFromPath('a/b/c.JSON')).toBe('json')
  })

  it('maps a path with no extension to plaintext', () => {
    expect(languageFromPath('noext')).toBe('plaintext')
  })

  it('maps an unknown extension to plaintext', () => {
    expect(languageFromPath('x.unknownext')).toBe('plaintext')
  })

  it('maps a Windows path with .py to python', () => {
    expect(languageFromPath('C:\\dir\\file.py')).toBe('python')
  })

  it('maps .tsx to typescript', () => {
    expect(languageFromPath('component.tsx')).toBe('typescript')
  })

  it('maps .js to javascript', () => {
    expect(languageFromPath('script.js')).toBe('javascript')
  })

  it('maps .md to markdown', () => {
    expect(languageFromPath('README.md')).toBe('markdown')
  })

  it('maps .rs to rust', () => {
    expect(languageFromPath('main.rs')).toBe('rust')
  })
})
