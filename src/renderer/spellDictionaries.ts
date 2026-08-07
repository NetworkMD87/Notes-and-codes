import enUsAff from '@spell/en-us-aff?raw'
import enUsDic from '@spell/en-us-dic?raw'
import enGbAff from '@spell/en-gb-aff?raw'
import enGbDic from '@spell/en-gb-dic?raw'
import type { ResolvedSpellLocale } from '../shared/spell'

export interface BundledSpellDictionary {
  source: 'dictionary-en' | 'dictionary-en-gb'
  aff: string
  dic: string
}

const DICTIONARIES: Record<ResolvedSpellLocale, BundledSpellDictionary> = {
  'en-US': { source: 'dictionary-en', aff: enUsAff, dic: enUsDic },
  'en-GB': { source: 'dictionary-en-gb', aff: enGbAff, dic: enGbDic }
}

export function bundledDictionary(locale: ResolvedSpellLocale): BundledSpellDictionary {
  return DICTIONARIES[locale]
}
