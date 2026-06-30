import { describe, it, expect } from 'vitest'
import { parserForLanguage, isFormattable, formatText, UnsupportedLanguageError } from '../../src/renderer/formatter'

describe('parserForLanguage', () => {
  it('maps the supported languages to parser + plugin keys', () => {
    expect(parserForLanguage('javascript')).toEqual({ parser: 'babel', plugins: ['babel', 'estree'] })
    expect(parserForLanguage('typescript')).toEqual({ parser: 'typescript', plugins: ['typescript', 'estree'] })
    expect(parserForLanguage('json')).toEqual({ parser: 'json', plugins: ['babel', 'estree'] })
    expect(parserForLanguage('css')).toEqual({ parser: 'css', plugins: ['postcss'] })
    expect(parserForLanguage('scss')).toEqual({ parser: 'scss', plugins: ['postcss'] })
    expect(parserForLanguage('less')).toEqual({ parser: 'less', plugins: ['postcss'] })
    expect(parserForLanguage('html')).toEqual({ parser: 'html', plugins: ['html', 'babel', 'postcss', 'estree'] })
    expect(parserForLanguage('markdown')).toEqual({ parser: 'markdown', plugins: ['markdown'] })
    expect(parserForLanguage('yaml')).toEqual({ parser: 'yaml', plugins: ['yaml'] })
  })

  it('returns null for unsupported languages', () => {
    expect(parserForLanguage('plaintext')).toBeNull()
    expect(parserForLanguage('python')).toBeNull()
    expect(isFormattable('plaintext')).toBe(false)
    expect(isFormattable('typescript')).toBe(true)
  })
})

describe('formatText', () => {
  it('formats JavaScript with prettier defaults (semis, double quotes, 2-space)', async () => {
    expect((await formatText('const  x=1', 'javascript')).trim()).toBe('const x = 1;')
  })

  it('formats JSON', async () => {
    expect((await formatText('{"a":1,"b":2}', 'json')).trim()).toBe('{ "a": 1, "b": 2 }')
  })

  it('formats CSS', async () => {
    expect((await formatText('a{color:red}', 'css')).trim()).toBe('a {\n  color: red;\n}')
  })

  it('formats Markdown', async () => {
    expect((await formatText('#   Title', 'markdown')).trim()).toBe('# Title')
  })

  it('rejects unsupported languages with UnsupportedLanguageError', async () => {
    await expect(formatText('whatever', 'plaintext')).rejects.toBeInstanceOf(UnsupportedLanguageError)
  })

  it('rejects invalid syntax (does not swallow the parse error)', async () => {
    await expect(formatText('const x = (', 'javascript')).rejects.toThrow()
  })
})
