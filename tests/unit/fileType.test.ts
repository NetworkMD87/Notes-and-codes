import { describe, it, expect } from 'vitest'
import { fileType, langBadge } from '../../src/renderer/fileType'
import { HL_HEX } from '../../src/shared/types'

describe('fileType', () => {
  it('maps common extensions to a label + a palette colour', () => {
    expect(fileType('index.js')).toEqual({ label: 'js', colour: 'amber' })
    expect(fileType('App.tsx')).toEqual({ label: 'tsx', colour: 'blue' })
    expect(fileType('readme.md')).toEqual({ label: 'md', colour: 'lime' })
    expect(fileType('notes.txt')).toEqual({ label: 'txt', colour: 'slate' })
    expect(fileType('package.json')).toEqual({ label: 'json', colour: 'yellow' })
  })
  it('is case-insensitive on the extension', () => {
    expect(fileType('DATA.JSON')).toEqual({ label: 'json', colour: 'yellow' })
  })
  it('returns a muted (null-colour) badge for unknown extensions', () => {
    expect(fileType('notes.xyz')).toEqual({ label: 'xyz', colour: null })
  })
  it('handles extension-less names and dotfiles with a muted short label', () => {
    expect(fileType('Makefile')).toEqual({ label: 'mak', colour: null })
    expect(fileType('.gitignore')).toEqual({ label: 'git', colour: null })
  })
  it('clamps the label to 4 chars and uses the last extension', () => {
    expect(fileType('archive.tar.gz')).toEqual({ label: 'gz', colour: null })
    expect(fileType('x.markdown').label.length).toBeLessThanOrEqual(4)
  })
  it('only ever returns colour names that exist in the shared palette', () => {
    for (const n of ['a.js','a.ts','a.tsx','a.json','a.md','a.css','a.scss','a.html','a.py','a.go',
      'a.rs','a.java','a.cs','a.c','a.cpp','a.rb','a.php','a.sh','a.yml','a.sql','a.vue']) {
      const c = fileType(n).colour
      if (c) expect(HL_HEX[c], `${n} → ${c}`).toBeTruthy()
    }
  })
})

describe('langBadge', () => {
  it('maps Monaco languages to the same label + colour as the extension', () => {
    expect(langBadge('typescript')).toEqual({ label: 'ts', colour: 'blue' })
    expect(langBadge('markdown')).toEqual({ label: 'md', colour: 'lime' })
    expect(langBadge('python')).toEqual({ label: 'py', colour: 'green' })
    expect(langBadge('json')).toEqual({ label: 'json', colour: 'yellow' })
    expect(langBadge('csharp')).toEqual({ label: 'cs', colour: 'fuchsia' })
  })
  it('gives plaintext a slate txt badge', () => {
    expect(langBadge('plaintext')).toEqual({ label: 'txt', colour: 'slate' })
  })
  it('falls back to a muted short label for an unknown language', () => {
    expect(langBadge('brainfuck')).toEqual({ label: 'brai', colour: null })
  })
  it('only returns palette colour names (or null)', () => {
    for (const l of ['typescript','javascript','json','markdown','html','css','python','go','rust',
      'java','csharp','ruby','php','shell','yaml','sql','xml','cpp','c','plaintext']) {
      const c = langBadge(l).colour
      if (c) expect(HL_HEX[c], `${l} → ${c}`).toBeTruthy()
    }
  })
})
