import { describe, expect, it } from 'vitest'
import { verifyBundle } from '../../scripts/verifySpellAssets.mjs'

const validBundle = (extra = '') => [
  '/* @author <https://feross.org> */',
  'const payload = `SET UTF-8\nSET UTF-8\n49568\n49601\ncolor colour',
  'x'.repeat(500_000) + '`',
  extra
].join('\n')

describe('verifySpellAssets', () => {
  it('ignores URL literals in JavaScript comments', () => {
    expect(() => verifyBundle(validBundle(), 'fixture')).not.toThrow()
  })

  it.each([
    'const endpoint = "https://example.test/dictionary"',
    'const url=/https?:\\/\\//; fetch("dictionary")',
    'function proof() { return /https?:\\/\\//; fetch("dictionary") }',
    'return /https?:\\/\\//; fetch("dictionary")',
    'fetch("dictionary")',
    'new XMLHttpRequest()',
    'new WebSocket("wss://example.test")',
    'setSpellCheckerDictionaryDownloadURL("https://example.test")'
    , 'import("node:fs")'
    , 'require("fs/promises")'
    , 'import fs from "fs"; fs.readFile("dictionary")'
    , 'import "node:child_process"'
    , 'import "async_hooks"'
  ])('rejects executable network content: %s', (networkCode) => {
    expect(() => verifyBundle(validBundle(networkCode), 'fixture')).toThrow(/forbidden (network|Node) dependency/)
  })
})
