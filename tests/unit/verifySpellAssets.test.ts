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

  it.each([
    'const request = globalThis.fetch; request("/dictionary")',
    'const request = fetch; request("/dictionary")',
    'const { fetch: request } = globalThis; request("/dictionary")',
    'let request; ({ fetch: request } = globalThis); request("/dictionary")',
    'let fetch; ({ fetch } = globalThis); fetch("/dictionary")',
    'const first = globalThis.fetch; const second = first; second("/dictionary")',
    '{ const fetch = () => "offline"; fetch() } fetch("/dictionary")',
    'function run(request = globalThis.fetch) { request("/dictionary") }',
    'Reflect.apply(globalThis.fetch, null, ["/dictionary"])',
    'const api = { request: globalThis.fetch }; api.request("/dictionary")',
    'const open = globalThis.XMLHttpRequest; new open()',
  ])('rejects executable aliases of network APIs: %s', (networkCode) => {
    expect(() => verifyBundle(validBundle(networkCode), 'fixture')).toThrow(/forbidden network dependency/)
  })

  it.each([
    'const fetch = () => "offline"; fetch()',
    'function use(fetch) { return fetch() }',
    'fetch(); function fetch() { return "local" }',
  ])('accepts shadowed or inert network references: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'for (const request of [globalThis.fetch]) { request("/dictionary") }',
    'try { throw 1 } catch (error) { const request = globalThis.fetch }',
    'let request; function assign() { request = globalThis.fetch }',
    'let request = globalThis.fetch; request = () => "offline"; request()',
    'const request = ready ? globalThis.fetch : (() => "offline")',
    'const { fetch: request } = globalThis',
    'let request; ({ fetch: request } = globalThis)',
    'function run(request = globalThis.fetch) { return request }',
    'const api = { request: globalThis.fetch, ...safe }',
    'const api = { [globalThis.fetch]: "value" }',
    'const api = { [globalThis.fetch]() { return "offline" } }',
    'consume(globalThis.fetch)',
    'this.fetch("/dictionary")',
    'tag`${globalThis.fetch}`',
    'Reflect.get(globalThis, "fetch")',
    'globalThis["fe" + "tch"]("/dictionary")',
    'const { ...request } = globalThis',
    'queueMicrotask(globalThis.fetch)',
    'globalThis.fetch.bind(null)',
    'class Local { method() { var fetch = () => "local"; return fetch() } } fetch("/dictionary")',
  ])('rejects every executable forbidden-capability reference: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden network dependency/)
  })

  it.each([
    'for (const fetch of localList) { fetch() }',
    'try { throw 1 } catch (fetch) { fetch() }',
    'function outer(fetch) { return () => fetch() }',
    'const api = { fetch: "key", ["fetch"]: "computed key", fetch() { return "local" } }',
    'fetch: for (;;) { break fetch }',
    'const tag = (parts) => parts[0]; tag`fetch globalThis.fetch`',
    'const globalThis = { fetch: () => "local" }; globalThis.fetch()',
    'function run(fetch = () => "local") { return fetch() }',
    'const documentation = { fetch: "globalThis.fetch", label: `fetch` }',
  ])('allows inert syntax and genuine lexical shadows: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })
})
