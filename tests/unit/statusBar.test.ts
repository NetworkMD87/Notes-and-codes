// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { StatusBar } from '../../src/renderer/statusBar'

describe('StatusBar', () => {
  it('renders labelled encoding/EOL selects and emits exact values', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const onEncoding = vi.fn()
    const onEol = vi.fn()

    new StatusBar(host, { onEncoding, onEol }).update({
      language: 'plaintext', encoding: 'utf8', eol: 'LF', cursor: { line: 1, col: 1 }, dirty: false,
    })

    const encoding = host.querySelector<HTMLSelectElement>('select[aria-label="File encoding"]')!
    const eol = host.querySelector<HTMLSelectElement>('select[aria-label="Line endings"]')!

    expect([...encoding.options].map(o => [o.value, o.textContent])).toEqual([
      ['utf8', 'UTF-8'], ['utf8bom', 'UTF-8 BOM'], ['utf16le', 'UTF-16 LE'], ['utf16be', 'UTF-16 BE'],
    ])

    encoding.value = 'utf16le'
    encoding.dispatchEvent(new Event('change'))
    eol.value = 'CRLF'
    eol.dispatchEvent(new Event('change'))

    expect(onEncoding).toHaveBeenCalledWith('utf16le')
    expect(onEol).toHaveBeenCalledWith('CRLF')
    expect(encoding.getAttribute('aria-describedby')).toBe(eol.getAttribute('aria-describedby'))
    expect(document.getElementById(encoding.getAttribute('aria-describedby')!)?.textContent).toMatch(/next save/i)
  })
})
