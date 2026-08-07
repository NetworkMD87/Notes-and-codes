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

function forbiddenDependency(file) {
  let found = null
  const globalObjects = new Set(['globalThis', 'window', 'self', 'navigator', 'electron', 'session', 'Reflect'])
  const rootValuedMembers = new Set([...globalObjects, 'defaultSession'])
  const rejectNetwork = (name) => { found = { kind: 'network', name } }
  const rejectNode = (name) => { found = { kind: 'Node', name } }
  const forbiddenCapability = (name) => name === 'require' || forbiddenNetworkApis.has(name)
  const rejectCapability = (name) => {
    if (name === 'require') rejectNode(name)
    else rejectNetwork(name)
  }
  const scope = (parent = null) => ({
    parent,
    bindings: new Set(),
    thisIsGlobalRoot: parent ? parent.thisIsGlobalRoot : true,
  })
  const isBound = (currentScope, name) => {
    for (let candidate = currentScope; candidate; candidate = candidate.parent) {
      if (candidate.bindings.has(name)) return true
    }
    return false
  }
  const declarePattern = (name, currentScope) => {
    if (ts.isIdentifier(name)) {
      currentScope.bindings.add(name.text)
      return
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) declarePattern(element.name, currentScope)
    }
  }
  const declareImport = (node, currentScope) => {
    const clause = node.importClause
    if (!clause) return
    if (clause.name) currentScope.bindings.add(clause.name.text)
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) currentScope.bindings.add(bindings.name.text)
    else if (bindings) for (const element of bindings.elements) currentScope.bindings.add(element.name.text)
  }
  const predeclareLexical = (statements, currentScope) => {
    for (const statement of statements) {
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
        currentScope.bindings.add(statement.name.text)
      } else if (ts.isVariableStatement(statement) &&
          (statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
        for (const declaration of statement.declarationList.declarations) declarePattern(declaration.name, currentScope)
      } else if (ts.isImportDeclaration(statement)) {
        declareImport(statement, currentScope)
      }
    }
  }
  const predeclareVars = (node, currentScope) => {
    if (node !== file && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) ||
        ts.isClassStaticBlockDeclaration(node))) return
    if (ts.isVariableDeclarationList(node) && !(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
      for (const declaration of node.declarations) declarePattern(declaration.name, currentScope)
      return
    }
    ts.forEachChild(node, child => predeclareVars(child, currentScope))
  }
  const staticExpressionText = (node) => {
    if (!node) return null
    const current = unwrapExpression(node)
    const simple = staticText(current)
    if (simple !== null) return simple
    if (ts.isNumericLiteral(current)) return current.text
    if (ts.isTemplateExpression(current)) {
      let value = current.head.text
      for (const span of current.templateSpans) {
        const substitution = staticExpressionText(span.expression)
        if (substitution === null) return null
        value += substitution + span.literal.text
      }
      return value
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticExpressionText(current.left)
      const right = staticExpressionText(current.right)
      return left !== null && right !== null ? left + right : null
    }
    return null
  }
  const staticExpressionPrefix = (node) => {
    if (!node) return ''
    const current = unwrapExpression(node)
    const value = staticExpressionText(current)
    if (value !== null) return value
    if (ts.isTemplateExpression(current)) {
      let prefix = current.head.text
      for (const span of current.templateSpans) {
        const substitution = staticExpressionText(span.expression)
        if (substitution === null) return prefix
        prefix += substitution + span.literal.text
      }
      return prefix
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = staticExpressionText(current.left)
      return left !== null
        ? left + staticExpressionPrefix(current.right)
        : staticExpressionPrefix(current.left)
    }
    return ''
  }
  const staticMemberName = (node) => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text
    if (ts.isElementAccessExpression(node)) return staticExpressionText(node.argumentExpression)
    return null
  }
  const normalizedCall = (expression, root, member, currentScope) => {
    let callable = unwrapExpression(expression)
    let argumentOffset = 0
    if ((ts.isPropertyAccessExpression(callable) || ts.isElementAccessExpression(callable)) &&
        staticMemberName(callable) === 'call') {
      callable = unwrapExpression(callable.expression)
      argumentOffset = 1
    }
    if (!(ts.isPropertyAccessExpression(callable) || ts.isElementAccessExpression(callable)) ||
        staticMemberName(callable) !== member) return null
    const base = unwrapExpression(callable.expression)
    return ts.isIdentifier(base) && base.text === root && !isBound(currentScope, root)
      ? { argumentOffset }
      : null
  }
  const globalRoot = (expression, currentScope) => {
    if (!expression) return null
    const current = unwrapExpression(expression)
    if (current.kind === ts.SyntaxKind.ThisKeyword) return currentScope.thisIsGlobalRoot ? 'this' : null
    if (ts.isIdentifier(current)) {
      return globalObjects.has(current.text) && !isBound(currentScope, current.text) ? current.text : null
    }
    if (ts.isCallExpression(current)) {
      const reflectGet = normalizedCall(current.expression, 'Reflect', 'get', currentScope)
      if (!reflectGet) return null
      const target = current.arguments[reflectGet.argumentOffset]
      const name = staticExpressionText(current.arguments[reflectGet.argumentOffset + 1])
      return globalRoot(target, currentScope) && name && rootValuedMembers.has(name) ? name : null
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      return globalRoot(current.expression, currentScope)
    }
    return null
  }
  const extractedCapability = (pattern) => {
    if (ts.isObjectBindingPattern(pattern)) {
      for (const element of pattern.elements) {
        if (element.dotDotDotToken) return 'global object spread'
        const property = element.propertyName ?? element.name
        const name = ts.isComputedPropertyName(property)
          ? staticExpressionText(property.expression)
          : ts.isIdentifier(property) || ts.isStringLiteral(property) || ts.isNumericLiteral(property)
            ? property.text
            : null
        if (name === null || forbiddenCapability(name)) return name ?? 'dynamic global member'
        if (rootValuedMembers.has(name) && !ts.isObjectBindingPattern(element.name)) return `root container ${name}`
        const nested = extractedCapability(element.name)
        if (nested) return nested
      }
    } else if (ts.isObjectLiteralExpression(pattern)) {
      for (const property of pattern.properties) {
        if (ts.isSpreadAssignment(property)) return 'global object spread'
        if (ts.isShorthandPropertyAssignment(property)) {
          if (forbiddenCapability(property.name.text)) return property.name.text
          if (rootValuedMembers.has(property.name.text)) return `root container ${property.name.text}`
        } else if (ts.isPropertyAssignment(property)) {
          const name = ts.isComputedPropertyName(property.name)
            ? staticExpressionText(property.name.expression)
            : ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
              ? property.name.text
              : null
          if (name === null || forbiddenCapability(name)) return name ?? 'dynamic global member'
          if (rootValuedMembers.has(name) && !ts.isObjectLiteralExpression(property.initializer)) {
            return `root container ${name}`
          }
          const nested = extractedCapability(property.initializer)
          if (nested) return nested
        }
      }
    }
    return null
  }
  const visitBindingExpressions = (pattern, currentScope) => {
    if (ts.isIdentifier(pattern)) return
    for (const element of pattern.elements) {
      if (!ts.isBindingElement(element)) continue
      if (element.propertyName && ts.isComputedPropertyName(element.propertyName)) {
        visit(element.propertyName.expression, currentScope)
      }
      if (element.initializer) visit(element.initializer, currentScope)
      visitBindingExpressions(element.name, currentScope)
    }
  }
  const visitRootExtraction = (pattern, initializer, currentScope) => {
    if (!globalRoot(initializer, currentScope) ||
        !(ts.isObjectBindingPattern(pattern) || ts.isObjectLiteralExpression(pattern))) return false
    const extracted = extractedCapability(pattern)
    if (extracted) rejectCapability(extracted)
    else visit(initializer, currentScope, true)
    return true
  }
  const visitFunction = (node, parentScope) => {
    const functionScope = scope(parentScope)
    if (!ts.isArrowFunction(node)) functionScope.thisIsGlobalRoot = false
    if (node.name && ts.isIdentifier(node.name)) functionScope.bindings.add(node.name.text)
    for (const parameter of node.parameters) declarePattern(parameter.name, functionScope)
    for (const parameter of node.parameters) {
      visitBindingExpressions(parameter.name, functionScope)
      if (parameter.initializer && !visitRootExtraction(parameter.name, parameter.initializer, functionScope)) {
        visit(parameter.initializer, functionScope)
      }
      if (found) return
    }
    if (!node.body) return
    if (!ts.isBlock(node.body)) {
      visit(node.body, functionScope)
      return
    }
    predeclareVars(node.body, functionScope)
    const bodyScope = scope(functionScope)
    predeclareLexical(node.body.statements, bodyScope)
    for (const statement of node.body.statements) {
      visit(statement, bodyScope)
      if (found) return
    }
  }
  const visitPropertyName = (name, currentScope) => {
    if (ts.isComputedPropertyName(name)) visit(name.expression, currentScope)
  }
  const visitStatements = (statements, parentScope) => {
    const blockScope = scope(parentScope)
    predeclareLexical(statements, blockScope)
    for (const statement of statements) {
      visit(statement, blockScope)
      if (found) return
    }
  }
  const visit = (node, currentScope, allowGlobalRoot = false) => {
    if (found) return
    if (ts.isSourceFile(node)) {
      predeclareVars(node, currentScope)
      predeclareLexical(node.statements, currentScope)
      for (const statement of node.statements) {
        visit(statement, currentScope)
        if (found) return
      }
      return
    } else if (ts.isBlock(node)) {
      visitStatements(node.statements, currentScope)
      return
    } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const moduleName = node.moduleSpecifier && staticText(node.moduleSpecifier)
      if (networkModuleUrl(node.moduleSpecifier)) rejectNetwork('network module URL')
      else if (moduleName && nodeBuiltin(moduleName)) rejectNode(moduleName)
      return
    } else if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
      visit(node.expression, currentScope, allowGlobalRoot)
      return
    } else if (node.kind === ts.SyntaxKind.ThisKeyword) {
      if (currentScope.thisIsGlobalRoot && !allowGlobalRoot) rejectNetwork('global root escape this')
      return
    } else if (ts.isIdentifier(node)) {
      if (forbiddenNetworkApis.has(node.text) && !isBound(currentScope, node.text)) rejectNetwork(node.text)
      else if (node.text === 'require' && !isBound(currentScope, 'require')) rejectNode('require')
      else if (globalObjects.has(node.text) && !isBound(currentScope, node.text) && !allowGlobalRoot) {
        rejectNetwork(`global root escape ${node.text}`)
      }
      return
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const moduleName = node.arguments[0] && staticExpressionText(node.arguments[0])
        const modulePrefix = moduleName ?? staticExpressionPrefix(node.arguments[0])
        const nodeSubpathPrefix = modulePrefix.endsWith('/') && nodeBuiltin(modulePrefix.slice(0, -1))
        if (/^https?:\/\//i.test(modulePrefix)) rejectNetwork('network module URL')
        else if (/^node:/i.test(modulePrefix) || nodeSubpathPrefix || (moduleName && nodeBuiltin(moduleName))) {
          rejectNode(moduleName ?? modulePrefix)
        }
        if (found) return
      }
      const reflectGet = normalizedCall(node.expression, 'Reflect', 'get', currentScope)
      let allowedRootArgument = -1
      if (reflectGet) {
        const targetIndex = reflectGet.argumentOffset
        const propertyIndex = targetIndex + 1
        const target = node.arguments[targetIndex]
        const name = staticExpressionText(node.arguments[propertyIndex])
        const targetRoot = globalRoot(target, currentScope)
        if (targetRoot && (name === null || forbiddenCapability(name))) {
          rejectCapability(name ?? 'dynamic global member')
          return
        }
        if (targetRoot && name && rootValuedMembers.has(name) && !allowGlobalRoot) {
          rejectNetwork(`root container ${name}`)
          return
        }
        if (targetRoot) allowedRootArgument = targetIndex
      }
      visit(node.expression, currentScope)
      for (let index = 0; index < node.arguments.length; index += 1) {
        visit(node.arguments[index], currentScope, index === allowedRootArgument)
      }
      return
    } else if (ts.isNewExpression(node)) {
      visit(node.expression, currentScope)
      for (const argument of node.arguments ?? []) visit(argument, currentScope)
      return
    } else if (ts.isVariableDeclaration(node)) {
      visitBindingExpressions(node.name, currentScope)
      const handledExtraction = node.initializer && visitRootExtraction(node.name, node.initializer, currentScope)
      if (!found && node.initializer && !handledExtraction) visit(node.initializer, currentScope)
      return
    } else if (ts.isFunctionDeclaration(node)) {
      visitFunction(node, currentScope)
      return
    } else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)) {
      visitFunction(node, currentScope)
      return
    } else if (ts.isMethodDeclaration(node)) {
      visitPropertyName(node.name, currentScope)
      visitFunction(node, currentScope)
      return
    } else if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const classScope = scope(currentScope)
      if (node.name) classScope.bindings.add(node.name.text)
      if (node.heritageClauses) for (const clause of node.heritageClauses) {
        for (const type of clause.types) visit(type.expression, classScope)
      }
      for (const member of node.members) visit(member, classScope)
      return
    } else if (ts.isClassStaticBlockDeclaration(node)) {
      const staticScope = scope(currentScope)
      staticScope.thisIsGlobalRoot = false
      predeclareVars(node.body, staticScope)
      predeclareLexical(node.body.statements, staticScope)
      for (const statement of node.body.statements) visit(statement, staticScope)
      return
    } else if (ts.isPropertyAccessExpression(node)) {
      const root = globalRoot(node.expression, currentScope)
      if (root && forbiddenCapability(node.name.text)) {
        rejectCapability(node.name.text)
        return
      }
      if (root && rootValuedMembers.has(node.name.text) && !allowGlobalRoot) {
        rejectNetwork(`root container ${node.name.text}`)
        return
      }
      visit(node.expression, currentScope, Boolean(root))
      return
    } else if (ts.isElementAccessExpression(node)) {
      const root = globalRoot(node.expression, currentScope)
      if (root) {
        const name = staticExpressionText(node.argumentExpression)
        if (name === null || forbiddenCapability(name)) {
          rejectCapability(name ?? 'dynamic global member')
          return
        }
        if (rootValuedMembers.has(name) && !allowGlobalRoot) {
          rejectNetwork(`root container ${name}`)
          return
        }
      }
      visit(node.expression, currentScope, Boolean(root))
      if (node.argumentExpression) visit(node.argumentExpression, currentScope)
      return
    } else if (ts.isPropertyAssignment(node)) {
      visitPropertyName(node.name, currentScope)
      visit(node.initializer, currentScope)
      return
    } else if (ts.isShorthandPropertyAssignment(node)) {
      visit(node.name, currentScope)
      if (node.objectAssignmentInitializer) visit(node.objectAssignmentInitializer, currentScope)
      return
    } else if (ts.isSpreadAssignment(node)) {
      visit(node.expression, currentScope)
      return
    } else if (ts.isPropertyDeclaration(node)) {
      visitPropertyName(node.name, currentScope)
      if (node.initializer && !found) {
        const initializerScope = scope(currentScope)
        initializerScope.thisIsGlobalRoot = false
        visit(node.initializer, initializerScope)
      }
      return
    } else if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      visitPropertyName(node.name, currentScope)
      visitFunction(node, currentScope)
      return
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      visit(node.left, currentScope)
      if (!found) visit(node.right, currentScope, allowGlobalRoot)
      return
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrapExpression(node.left)
      const handledExtraction = visitRootExtraction(left, node.right, currentScope)
      if (!found && !handledExtraction) visit(node.right, currentScope)
      if (!found) visit(left, currentScope)
      return
    } else if (ts.isCatchClause(node)) {
      const catchScope = scope(currentScope)
      if (node.variableDeclaration) {
        declarePattern(node.variableDeclaration.name, catchScope)
        visitBindingExpressions(node.variableDeclaration.name, catchScope)
      }
      visit(node.block, catchScope)
      return
    } else if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const initializer = node.initializer
      const lexical = initializer && ts.isVariableDeclarationList(initializer) &&
        Boolean(initializer.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))
      const loopScope = lexical ? scope(currentScope) : currentScope
      if (lexical) for (const declaration of initializer.declarations) declarePattern(declaration.name, loopScope)
      if (initializer) visit(initializer, loopScope)
      if (ts.isForStatement(node)) {
        if (node.condition) visit(node.condition, loopScope)
        if (node.incrementor) visit(node.incrementor, loopScope)
      } else {
        visit(node.expression, loopScope)
      }
      visit(node.statement, loopScope)
      return
    } else if (ts.isSwitchStatement(node)) {
      visit(node.expression, currentScope)
      const switchScope = scope(currentScope)
      predeclareLexical(node.caseBlock.clauses.flatMap(clause => [...clause.statements]), switchScope)
      for (const clause of node.caseBlock.clauses) {
        if (ts.isCaseClause(clause)) visit(clause.expression, switchScope)
        for (const statement of clause.statements) visit(statement, switchScope)
      }
      return
    } else if (ts.isLabeledStatement(node)) {
      visit(node.statement, currentScope)
      return
    } else if (ts.isBreakOrContinueStatement(node)) {
      return
    }
    ts.forEachChild(node, child => visit(child, currentScope))
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
  const dependency = forbiddenDependency(file)
  if (dependency) throw new Error(`${label} contains forbidden ${dependency.kind} dependency ${dependency.name}`)
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
