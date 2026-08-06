import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import ts from 'typescript'
import { spellAssetAliases, spellRawAssetAliases } from './spellAssetAliases.mjs'

const forbiddenNetworkApis = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'importScripts',
  'setSpellCheckerDictionaryDownloadURL',
])

async function javascriptFiles(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.m?js$/.test(entry.name))
    .map(entry => join(dir, entry.name))
}

const nodeBuiltins = new Set(builtinModules.map(value => value.replace(/^node:/, '')))
const nodeBuiltin = (value) => {
  const normalized = value.replace(/^node:/, '')
  return nodeBuiltins.has(normalized) || nodeBuiltins.has(normalized.split('/')[0])
}

function hasNodeDependency(file) {
  let found = false
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      found ||= Boolean(node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && nodeBuiltin(node.moduleSpecifier.text))
    } else if (ts.isCallExpression(node)) {
      const argument = node.arguments[0]
      found ||= Boolean(argument && ts.isStringLiteral(argument) && nodeBuiltin(argument.text) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')))
    }
    if (!found) ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

const staticText = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function invocationName(expression) {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
    return invocationName(expression.expression)
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return invocationName(expression.right)
  }
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) {
    if (['call', 'apply', 'bind'].includes(expression.name.text)) return invocationName(expression.expression)
    return expression.name.text
  }
  if (ts.isElementAccessExpression(expression)) {
    const name = expression.argumentExpression && staticText(expression.argumentExpression)
    if (name && ['call', 'apply', 'bind'].includes(name)) return invocationName(expression.expression)
    return name
  }
  return null
}

const networkModuleUrl = (node) => {
  const value = node && staticText(node)
  return Boolean(value && /^https?:\/\//i.test(value))
}

function forbiddenNetworkDependency(file) {
  let found = null
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (networkModuleUrl(node.moduleSpecifier)) found = 'network module URL'
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = invocationName(node.expression)
      if (name && forbiddenNetworkApis.has(name)) found = name
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          networkModuleUrl(node.arguments[0])) found = 'network module URL'
    } else if (ts.isTaggedTemplateExpression(node)) {
      const name = invocationName(node.tag)
      if (name && forbiddenNetworkApis.has(name)) found = name
    }
    if (!found) ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

export function verifyBundle(source, label) {
  if (source.length < 500_000) throw new Error(`${label} is too small to contain both English dictionaries`)
  for (const sentinel of ['color', 'colour']) {
    if (!source.includes(sentinel)) throw new Error(`${label} is missing dictionary sentinel ${sentinel}`)
  }
  if ((source.match(/SET UTF-8/g) ?? []).length < 2) throw new Error(`${label} is missing two Hunspell affix payloads`)
  if ((source.match(/\d{4,6}(?:\\r\\n|\\n|\r?\n)/g) ?? []).length < 2) throw new Error(`${label} is missing two Hunspell dictionary headers`)
  const file = ts.createSourceFile(`${label}.js`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if (hasNodeDependency(file)) throw new Error(`${label} contains forbidden Node dependency`)
  const networkDependency = forbiddenNetworkDependency(file)
  if (networkDependency) throw new Error(`${label} contains forbidden network dependency ${networkDependency}`)
}

async function proof() {
  const outDir = await mkdtemp(join(tmpdir(), 'notes-codes-spell-proof-'))
  try {
    const output = await build({
      configFile: false,
      resolve: { alias: { ...spellAssetAliases, ...spellRawAssetAliases } },
      build: {
        outDir,
        emptyOutDir: true,
        write: false,
        lib: { entry: 'src/renderer/spellEngine.ts', formats: ['es'], fileName: 'spell-proof' }
      }
    })
    const chunks = (Array.isArray(output) ? output[0] : output).output.filter(output => output.type === 'chunk')
    if (chunks.some(chunk => chunk.imports.length || chunk.dynamicImports.length)) throw new Error('proof build externalized a dependency')
    verifyBundle(chunks.map(chunk => chunk.code).join('\n'), 'proof bundle')
    console.log('Spell asset proof passed')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

async function app() {
  const assets = 'out/renderer/assets'
  const worker = (await javascriptFiles(assets)).find(file => /spell.*worker|worker.*spell/i.test(file))
  if (!worker) throw new Error('No spell worker chunk found; run this after Task 5 builds the application')
  verifyBundle(await readFile(worker, 'utf8'), 'spell worker chunk')
  console.log('Spell worker assets verified')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2]
  if (mode === '--proof') await proof()
  else if (mode === '--app') await app()
  else throw new Error('Usage: node scripts/verifySpellAssets.mjs --proof|--app')
}
