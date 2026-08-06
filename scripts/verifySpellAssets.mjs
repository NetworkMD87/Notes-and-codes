import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import ts from 'typescript'
import { spellAssetAliases, spellRawAssetAliases } from './spellAssetAliases.mjs'

const forbidden = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'setSpellCheckerDictionaryDownloadURL', 'http://', 'https://', 'node:fs', 'fs/promises', 'require(', 'import(']

async function javascriptFiles(dir) {
  return (await readdir(dir, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /\.m?js$/.test(entry.name))
    .map(entry => join(dir, entry.name))
}

function withoutJavaScriptComments(source) {
  const file = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const ranges = new Map()
  const collect = (node) => {
    ts.forEachLeadingCommentRange(source, node.getFullStart(), (position, end) => ranges.set(position, end))
    ts.forEachTrailingCommentRange(source, node.end, (position, end) => ranges.set(position, end))
    ts.forEachChild(node, collect)
  }
  collect(file)
  const chars = source.split('')
  for (const [position, end] of ranges) chars.fill(' ', position, end)
  return chars.join('')
}

const nodeBuiltins = new Set(builtinModules.map(value => value.replace(/^node:/, '')))
const nodeBuiltin = (value) => {
  const normalized = value.replace(/^node:/, '')
  return nodeBuiltins.has(normalized) || nodeBuiltins.has(normalized.split('/')[0])
}

function hasNodeDependency(source) {
  const file = ts.createSourceFile('bundle.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
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

export function verifyBundle(source, label) {
  if (source.length < 500_000) throw new Error(`${label} is too small to contain both English dictionaries`)
  for (const sentinel of ['color', 'colour']) {
    if (!source.includes(sentinel)) throw new Error(`${label} is missing dictionary sentinel ${sentinel}`)
  }
  if ((source.match(/SET UTF-8/g) ?? []).length < 2) throw new Error(`${label} is missing two Hunspell affix payloads`)
  if ((source.match(/\d{4,6}(?:\\r?\\n|\r?\n)/g) ?? []).length < 2) throw new Error(`${label} is missing two Hunspell dictionary headers`)
  const executableSource = withoutJavaScriptComments(source)
  if (hasNodeDependency(executableSource)) throw new Error(`${label} contains forbidden Node dependency`)
  for (const value of forbidden) {
    if (executableSource.includes(value)) throw new Error(`${label} contains forbidden network dependency ${value}`)
  }
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
