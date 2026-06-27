import type { Plugin } from 'prettier'

export type PluginKey = 'babel' | 'estree' | 'typescript' | 'postcss' | 'html' | 'markdown' | 'yaml'

export interface ParserInfo { parser: string; plugins: PluginKey[] }
export interface FormatRange { start: number; end: number }

export class UnsupportedLanguageError extends Error {
  constructor(public readonly langId: string) {
    super(`Unsupported language: ${langId}`)
    this.name = 'UnsupportedLanguageError'
  }
}

const LANG_PARSERS: Record<string, ParserInfo> = {
  javascript: { parser: 'babel', plugins: ['babel', 'estree'] },
  javascriptreact: { parser: 'babel', plugins: ['babel', 'estree'] },
  typescript: { parser: 'typescript', plugins: ['typescript', 'estree'] },
  typescriptreact: { parser: 'typescript', plugins: ['typescript', 'estree'] },
  json: { parser: 'json', plugins: ['babel', 'estree'] },
  jsonc: { parser: 'json', plugins: ['babel', 'estree'] },
  css: { parser: 'css', plugins: ['postcss'] },
  scss: { parser: 'scss', plugins: ['postcss'] },
  less: { parser: 'less', plugins: ['postcss'] },
  html: { parser: 'html', plugins: ['html', 'babel', 'postcss', 'estree'] },
  markdown: { parser: 'markdown', plugins: ['markdown'] },
  yaml: { parser: 'yaml', plugins: ['yaml'] },
}

export function parserForLanguage(langId: string): ParserInfo | null {
  return LANG_PARSERS[langId] ?? null
}

export function isFormattable(langId: string): boolean {
  return parserForLanguage(langId) !== null
}

const pluginLoaders: Record<PluginKey, () => Promise<unknown>> = {
  babel: () => import('prettier/plugins/babel'),
  estree: () => import('prettier/plugins/estree'),
  typescript: () => import('prettier/plugins/typescript'),
  postcss: () => import('prettier/plugins/postcss'),
  html: () => import('prettier/plugins/html'),
  markdown: () => import('prettier/plugins/markdown'),
  yaml: () => import('prettier/plugins/yaml'),
}

const pluginCache = new Map<PluginKey, Plugin>()
let prettierMod: typeof import('prettier/standalone') | null = null

async function loadPlugin(key: PluginKey): Promise<Plugin> {
  const cached = pluginCache.get(key)
  if (cached) return cached
  const mod = (await pluginLoaders[key]()) as Plugin
  pluginCache.set(key, mod)
  return mod
}

export async function formatText(text: string, langId: string, range?: FormatRange): Promise<string> {
  const info = parserForLanguage(langId)
  if (!info) throw new UnsupportedLanguageError(langId)
  if (!prettierMod) prettierMod = await import('prettier/standalone')
  const plugins = await Promise.all(info.plugins.map(loadPlugin))
  return prettierMod.format(text, {
    parser: info.parser,
    plugins,
    ...(range ? { rangeStart: range.start, rangeEnd: range.end } : {}),
  })
}
