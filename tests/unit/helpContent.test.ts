import { describe, it, expect } from 'vitest'
import { HELP_SECTIONS, APP_LINKS, type HelpLink } from '../../src/renderer/helpContent'

describe('helpContent', () => {
  it('HELP_SECTIONS is non-empty', () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(0)
  })

  it('every category has at least one entry', () => {
    for (const cat of HELP_SECTIONS) {
      expect(cat.entries.length, `category "${cat.title}" should be non-empty`).toBeGreaterThan(0)
    }
  })

  it('no duplicate label within a category', () => {
    for (const cat of HELP_SECTIONS) {
      const labels = cat.entries.map(e => e.label)
      expect(new Set(labels).size, `duplicate in "${cat.title}"`).toBe(labels.length)
    }
  })

  it('descriptions, where present, are non-empty', () => {
    for (const cat of HELP_SECTIONS) {
      for (const e of cat.entries) {
        if (e.desc !== undefined) {
          expect(e.desc.trim().length, `empty desc on "${e.label}"`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('APP_LINKS urls parse and are https', () => {
    const all: HelpLink[] = [...APP_LINKS]
    for (const l of all) {
      const u = new URL(l.url)
      expect(u.protocol, `${l.label} -> ${l.url}`).toBe('https:')
    }
  })
})
