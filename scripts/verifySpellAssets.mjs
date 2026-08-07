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

function unwrapExpression(expression) {
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return unwrapExpression(expression.right)
  }
  return expression
}

const networkModuleUrl = (node) => {
  const value = node && staticText(node)
  return Boolean(value && /^https?:\/\//i.test(value))
}

function forbiddenNetworkDependency(file) {
  let found = null
  const globalObjects = new Set(['globalThis', 'window', 'self', 'navigator', 'electron', 'session', 'Reflect'])
  const forbidden = (name) => ({ kind: 'forbidden', name })
  const globalObject = (name) => ({ kind: 'global', name })
  const objectValue = (properties = new Map()) => ({ kind: 'object', properties })
  const reflectApply = { kind: 'reflect-apply' }
  const scope = (parent = null) => ({ parent, bindings: new Map() })
  const propertyName = (node) => {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
    return null
  }
  const lookup = (current, name) => {
    for (let candidate = current; candidate; candidate = candidate.parent) {
      if (candidate.bindings.has(name)) return { bound: true, value: candidate.bindings.get(name) }
    }
    if (forbiddenNetworkApis.has(name)) return { bound: false, value: forbidden(name) }
    if (globalObjects.has(name)) return { bound: false, value: globalObject(name) }
    return { bound: false, value: null }
  }
  const cloneValue = (value) => value?.kind === 'object'
    ? objectValue(new Map([...value.properties].map(([key, nested]) => [key, cloneValue(nested)])))
    : value
  const cloneScope = (current) => {
    if (!current) return null
    const cloned = scope(cloneScope(current.parent))
    for (const [name, value] of current.bindings) cloned.bindings.set(name, cloneValue(value))
    return cloned
  }
  const memberValue = (base, name) => {
    if (!base || !name) return null
    if (base.kind === 'forbidden' && ['call', 'apply', 'bind'].includes(name)) return base
    if (base.kind === 'object') return base.properties.get(name) ?? null
    if (base.kind === 'global') {
      if (base.name === 'Reflect' && name === 'apply') return reflectApply
      if (forbiddenNetworkApis.has(name)) return forbidden(name)
      return base // retain a qualified global root through chains such as electron.session.defaultSession
    }
    return null
  }
  const valueOf = (expression, currentScope) => {
    if (!expression) return null
    const current = unwrapExpression(expression)
    if (ts.isIdentifier(current)) return lookup(currentScope, current.text).value
    if (ts.isPropertyAccessExpression(current)) {
      return memberValue(valueOf(current.expression, currentScope), current.name.text)
    }
    if (ts.isElementAccessExpression(current)) {
      const name = current.argumentExpression && staticText(current.argumentExpression)
      return memberValue(valueOf(current.expression, currentScope), name)
    }
    if (ts.isObjectLiteralExpression(current)) {
      const properties = new Map()
      for (const property of current.properties) {
        if (ts.isPropertyAssignment(property)) {
          const name = propertyName(property.name)
          if (name) properties.set(name, valueOf(property.initializer, currentScope))
        } else if (ts.isShorthandPropertyAssignment(property)) {
          properties.set(property.name.text, lookup(currentScope, property.name.text).value)
        }
      }
      return objectValue(properties)
    }
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) &&
        current.expression.name.text === 'bind') {
      return valueOf(current.expression.expression, currentScope)
    }
    return null
  }
  const setExisting = (currentScope, name, value) => {
    for (let candidate = currentScope; candidate; candidate = candidate.parent) {
      if (candidate.bindings.has(name)) {
        candidate.bindings.set(name, value)
        return
      }
    }
    currentScope.bindings.set(name, value)
  }
  const declarePattern = (name, currentScope) => {
    if (ts.isIdentifier(name)) {
      currentScope.bindings.set(name.text, null)
      return
    }
    for (const element of name.elements) declarePattern(element.name, currentScope)
  }
  const assignPattern = (left, value, currentScope) => {
    if (ts.isIdentifier(left)) {
      setExisting(currentScope, left.text, value)
      return
    }
    if (ts.isObjectBindingPattern(left)) {
      for (const element of left.elements) {
        const key = propertyName(element.propertyName ?? element.name)
        assignPattern(element.name, memberValue(value, key), currentScope)
      }
      return
    }
    if (ts.isArrayBindingPattern(left)) {
      for (const element of left.elements) if (ts.isBindingElement(element)) assignPattern(element.name, null, currentScope)
      return
    }
    if (ts.isObjectLiteralExpression(left)) {
      for (const property of left.properties) {
        const target = ts.isShorthandPropertyAssignment(property) ? property.name
          : ts.isPropertyAssignment(property) ? property.initializer : null
        if (target) assignPattern(target, memberValue(value, propertyName(property.name)), currentScope)
      }
      return
    }
    if (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
      const base = valueOf(left.expression, currentScope)
      const name = ts.isPropertyAccessExpression(left)
        ? left.name.text
        : left.argumentExpression && staticText(left.argumentExpression)
      if (base?.kind === 'object' && name) base.properties.set(name, value)
    }
  }
  const predeclareStatements = (statements, currentScope) => {
    for (const statement of statements) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        currentScope.bindings.set(statement.name.text, null)
      } else if (ts.isVariableStatement(statement) &&
          (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
        for (const declaration of statement.declarationList.declarations) declarePattern(declaration.name, currentScope)
      }
    }
  }
  const predeclareVar = (node, currentScope) => {
    if (node !== file && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) return
    if (ts.isVariableDeclarationList(node) && !(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
      for (const declaration of node.declarations) declarePattern(declaration.name, currentScope)
      return
    }
    ts.forEachChild(node, child => predeclareVar(child, currentScope))
  }
  const visitFunction = (node, parentScope) => {
    const functionScope = scope(cloneScope(parentScope))
    if (node.name && ts.isIdentifier(node.name)) functionScope.bindings.set(node.name.text, null)
    for (const parameter of node.parameters) declarePattern(parameter.name, functionScope)
    for (const parameter of node.parameters) {
      if (!parameter.initializer) continue
      visit(parameter.initializer, functionScope)
      if (found) return
      assignPattern(parameter.name, valueOf(parameter.initializer, functionScope), functionScope)
    }
    if (node.body) {
      predeclareVar(node.body, functionScope)
      visit(node.body, functionScope)
    }
  }
  const analyzeStatements = (statements, currentScope) => {
    predeclareStatements(statements, currentScope)
    for (const statement of statements) {
      if (found) break
      visit(statement, currentScope)
    }
  }
  const visit = (node, currentScope) => {
    if (ts.isSourceFile(node)) {
      predeclareVar(node, currentScope)
      analyzeStatements(node.statements, currentScope)
      return
    } else if (ts.isBlock(node)) {
      const blockScope = scope(currentScope)
      analyzeStatements(node.statements, blockScope)
      return
    } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (networkModuleUrl(node.moduleSpecifier)) found = 'network module URL'
      if (ts.isImportDeclaration(node) && node.importClause) {
        if (node.importClause.name) currentScope.bindings.set(node.importClause.name.text, null)
        const bindings = node.importClause.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) currentScope.bindings.set(bindings.name.text, null)
        else if (bindings) for (const element of bindings.elements) currentScope.bindings.set(element.name.text, null)
      }
      return
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          networkModuleUrl(node.arguments[0])) {
        found = 'network module URL'
        return
      }
      const callable = valueOf(node.expression, currentScope)
      if (callable?.kind === 'forbidden') {
        found = callable.name
        return
      }
      if (callable?.kind === 'reflect-apply') {
        const target = node.arguments[0] && valueOf(node.arguments[0], currentScope)
        if (target?.kind === 'forbidden') {
          found = target.name
          return
        }
      }
      ts.forEachChild(node, child => { if (!found) visit(child, currentScope) })
      return
    } else if (ts.isTaggedTemplateExpression(node)) {
      const callable = valueOf(node.tag, currentScope)
      if (callable?.kind === 'forbidden') found = callable.name
      return
    } else if (ts.isVariableDeclaration(node)) {
      if (node.initializer) visit(node.initializer, currentScope)
      if (!found) assignPattern(node.name, valueOf(node.initializer, currentScope), currentScope)
      return
    } else if (ts.isFunctionDeclaration(node)) {
      visitFunction(node, currentScope)
      return
    } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      visitFunction(node, currentScope)
      return
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visit(node.right, currentScope)
      if (!found) assignPattern(unwrapExpression(node.left), valueOf(node.right, currentScope), currentScope)
      return
    }
    if (!found) ts.forEachChild(node, child => visit(child, currentScope))
  }
  visit(file, scope())
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
