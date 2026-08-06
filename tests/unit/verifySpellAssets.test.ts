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

  it('accepts dictionary headers with app-bundle escaped newlines', () => {
    const appBundle = validBundle().replace('49568\n49601\n', '49568\\n49601\\n')

    expect(() => verifyBundle(appBundle, 'fixture')).not.toThrow()
  })

  it.each([
    'const label = `EventSource`',
    'const documentation = "fetch(0) XMLHttpRequest WebSocket https://example.test"',
    'const labels = { fetch: 1, EventSource: 2, "sendBeacon": 3 }',
    'const labels = { fetch() { return "offline" } }',
    'function XMLHttpRequest() {}; class EventSource {}; const WebSocket = 1',
    'const endpoint = "https://example.test/dictionary"',
  ])('accepts inert API names, object keys, declarations, and URL text: %s', (inertCode) => {
    expect(() => verifyBundle(validBundle(inertCode), 'fixture')).not.toThrow()
  })

  it.each([
    'const url=/https?:\\/\\//; fetch("dictionary")',
    'function proof() { return /https?:\\/\\//; fetch("dictionary") }',
    'return /https?:\\/\\//; fetch("dictionary")',
    'fetch("dictionary")',
    'fetch ("dictionary")',
    'globalThis . fetch ("dictionary")',
    'window["fetch"] ("dictionary")',
    'new EventSource("/dictionary")',
    'new globalThis . EventSource ("/dictionary")',
    'navigator.sendBeacon("/dictionary")',
    'navigator . sendBeacon ("/dictionary")',
    'importScripts("/dictionary")',
    'self . importScripts ("/dictionary")',
    'new XMLHttpRequest()',
    'new globalThis["XMLHttpRequest"] ()',
    'new WebSocket("wss://example.test")',
    'electron.session.defaultSession . setSpellCheckerDictionaryDownloadURL ("https://example.test")',
    'import ("https://example.test/dictionary.js")',
    'export { words } from "https://example.test/dictionary.js"',
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
