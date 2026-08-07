import { describe, expect, it } from 'vitest'
import { verifyBundle } from '../../scripts/verifySpellAssets.mjs'

const validBundle = (extra = '') => [
  '/* @author <https://feross.org> */',
  'const payload = `SET UTF-8\nSET UTF-8\n49568\n49601\ncolor colour',
  'x'.repeat(500_000) + '`;',
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

  it.each([
    'const root = globalThis; root.fetch',
    'take(globalThis)',
    '(ready ? globalThis : local).fetch',
    'Reflect.get(ready ? globalThis : local, "fetch")',
    'Reflect["get"](globalThis, "fetch")',
    'Reflect["g" + "et"](globalThis, "fetch")',
    'Reflect.get.call(null, globalThis, "fetch")',
    'const load = require; load("fs")',
    'require("local-package")',
    'import(`node:fs`)',
  ])('rejects global-root escapes and normalized executable capabilities: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden (network|Node) dependency/)
  })

  it.each([
    'globalThis.console.log("offline")',
    'globalThis["console"].log("offline")',
    'Reflect.get(globalThis, "console")',
    'const globalThis = { fetch: () => "local" }; take(globalThis)',
    'const require = () => "local"; require("fs")',
    'require("fs"); function require() { return "local" }',
    'const Local = class fetch extends fetch {}',
  ])('allows direct safe root members and genuine local shadows: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'const { console } = globalThis; console.log("offline")',
    'const { console: logger } = globalThis; logger.log("offline")',
    'let logger; ({ console: logger } = globalThis); logger.log("offline")',
    'function use({ console } = globalThis) { console.log("offline") }',
    'const { console: { log } } = globalThis; log("offline")',
    '(0, globalThis).console.log("offline")',
    '(sideEffect(), globalThis)["console"].log("offline")',
    'import("offline-" + "dictionary")',
    'const globalThis = { require: () => "local" }; globalThis.require("fs")',
    'function use(globalThis) { return globalThis["require"]("fs") }',
    'const globalThis = {}; const Reflect = { get: () => () => "local" }; Reflect.get(globalThis, "require")("fs")',
  ])('allows proven-safe root boundaries and local require members: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'const { [name]: value } = globalThis',
    'function use(root = globalThis) { return root }',
    'function use({ fetch } = globalThis) { return fetch }',
    '(globalThis, local).console.log("offline")',
    '(0, globalThis).fetch("/dictionary")',
    'import("node:" + "fs")',
    'import("https:" + "//example.test/dictionary.js")',
    'globalThis.require("fs")',
    'globalThis["require"]("fs")',
    'globalThis["re" + "quire"]("fs")',
    'Reflect.get(globalThis, "require")("fs")',
  ])('rejects unsafe root boundaries and static Node capability acquisition: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden (network|Node) dependency/)
  })

  it.each([
    'globalThis.console.log("offline")',
    'globalThis.navigator.language',
    'globalThis.self.console.log("offline")',
    'Reflect.get(globalThis, "navigator").language',
    'const { navigator: { language } } = globalThis; String(language)',
    'const globalThis = { self: { fetch: () => "local" } }; const root = globalThis.self; root.fetch()',
    'const electron = { session: { defaultSession: { setSpellCheckerDictionaryDownloadURL: () => "local" } } }; const root = electron.session; root.defaultSession.setSpellCheckerDictionaryDownloadURL()',
    'const session = { defaultSession: { value: "local" } }; const root = session.defaultSession; root.value',
    'import(`offline-${"dictionary"}`)',
  ])('allows immediate safe container chains, lexical shadows, and local template imports: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'const root = globalThis.self; root.fetch("/dictionary")',
    'const { self: root } = globalThis; root.fetch("/dictionary")',
    'const root = Reflect.get(globalThis, "self"); root.fetch("/dictionary")',
    'take(globalThis.navigator)',
    'return globalThis.window',
    'const root = electron.session; root.defaultSession.setSpellCheckerDictionaryDownloadURL("https://example.test")',
    'const root = globalThis.electron.session; root.defaultSession.setSpellCheckerDictionaryDownloadURL("https://example.test")',
    'const { defaultSession: root } = electron.session; root.setSpellCheckerDictionaryDownloadURL("https://example.test")',
    'const root = Reflect.get(electron.session, "defaultSession"); root.setSpellCheckerDictionaryDownloadURL("https://example.test")',
    'import(`node:${"fs"}`)',
    'import(`https:${"//example.test/dictionary.js"}`)',
  ])('rejects container-root laundering and static template network imports: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden (network|Node) dependency/)
  })

  it.each([
    'const root = this; root.fetch("/dictionary")',
    'take(this)',
    'return this',
    '(ready ? this : local).console.log("offline")',
    'const getRoot = () => this; const root = getRoot(); root.fetch("/dictionary")',
  ])('rejects bare this as a global-root escape: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden network dependency/)
  })

  it.each([
    'this.console.log("offline")',
    '(0, this).console.log("offline")',
    'function localReceiver() { take(this); return this }',
  ])('allows safe this boundaries and local receivers: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'import(`node:${name}`)',
    'import(`https://example.test/${name}`)',
    'import(`http://${host}/dictionary.js`)',
    'import("node:" + moduleName)',
    'import("https://" + host + "/dictionary.js")',
    'import(("https:" + "//example.test/") + name)',
    'import(`node:${`fs/${name}`}`)',
    'import(`${`https://${"example.test"}/`}${name}`)',
  ])('rejects guaranteed forbidden prefixes in dynamic imports: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden (network|Node) dependency/)
  })

  it.each([
    'import(`offline-${name}`)',
    'import(`${scheme}://example.test/dictionary.js`)',
    'import("offline-" + name)',
    'import(scheme + "://example.test/dictionary.js")',
  ])('allows local or indeterminate dynamic-import prefixes: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'import(`fs/${subpath}`)',
    'import("path/" + subpath)',
    'import(`fs/promises/${subpath}`)',
    'import(`assert/strict/${subpath}`)',
    'import(`node:fs/${subpath}`)',
  ])('rejects guaranteed Node builtin subpath prefixes: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden Node dependency/)
  })

  it.each([
    'import(`fs-${name}`)',
    'import("fs" + suffix)',
    'import("path-extra/" + subpath)',
    'import(`local-package/${subpath}`)',
    'import(`@scope/fs/${subpath}`)',
    'import(`${packageName}/file`)',
  ])('allows non-builtin or indeterminate package prefixes: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'class Local { value = this }',
    'class Local { static value = this }',
    'class Local { static { take(this) } }',
    'class Local { value = () => this }',
  ])('allows local this receivers in class initialization: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).not.toThrow()
  })

  it.each([
    'class Local { [this.fetch] = 1 }',
    'class Local { [this.fetch]() {} }',
  ])('rejects forbidden global this members in computed class names: %s', (code) => {
    expect(() => verifyBundle(validBundle(code), 'fixture')).toThrow(/forbidden network dependency/)
  })
})
