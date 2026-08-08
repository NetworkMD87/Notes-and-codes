// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogController, focusableElements } from '../../src/renderer/dialogController'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const escape = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
const key = (target: HTMLElement, value: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))

function fixture() {
  const opener = document.createElement('button'); opener.textContent = 'Open'
  const panel = document.createElement('section')
  const title = document.createElement('h2'); title.id = 'dialog-title'; title.textContent = 'Example'
  const first = document.createElement('button'); first.textContent = 'First'
  const last = document.createElement('button'); last.textContent = 'Last'
  panel.append(title, first, last); document.body.append(opener, panel); opener.focus()
  const fallback = vi.fn()
  const controller = new DialogController(fallback)
  return { opener, panel, first, last, fallback, controller }
}

describe('DialogController', () => {
  const baseline = openCount()
  afterEach(() => {
    while (openCount() > baseline) escape()
    document.body.replaceChildren()
  })

  it('applies dialog semantics, focuses the requested target, and wraps Tab both ways', () => {
    const h = fixture()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: h.first, requestClose: () => h.controller.close() })
    expect(h.panel.getAttribute('role')).toBe('dialog')
    expect(h.panel.getAttribute('aria-modal')).toBe('true')
    expect(h.panel.getAttribute('aria-labelledby')).toBe('dialog-title')
    expect(document.activeElement).toBe(h.first)
    h.last.focus(); key(h.last, 'Tab'); expect(document.activeElement).toBe(h.first)
    h.first.focus(); key(h.first, 'Tab', true); expect(document.activeElement).toBe(h.last)
  })

  it('rejects an initial focus target outside the dialog panel', () => {
    const h = fixture()
    const external = document.createElement('button'); document.body.appendChild(external)
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: external, requestClose: () => h.controller.close() })
    expect(document.activeElement).toBe(h.first)
  })

  it('excludes CSS-hidden and inert controls from focusable candidates', () => {
    const panel = document.createElement('section')
    const displayNone = document.createElement('button'); displayNone.style.display = 'none'
    const visibilityHidden = document.createElement('button'); visibilityHidden.style.visibility = 'hidden'
    const inert = document.createElement('button'); inert.setAttribute('inert', '')
    const visible = document.createElement('button')
    panel.append(displayNone, visibilityHidden, inert, visible); document.body.appendChild(panel)
    expect(focusableElements(panel)).toEqual([visible])
  })

  it('handles one/no focusable controls without allowing focus to escape', () => {
    const h = fixture(); h.last.remove()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    key(h.first, 'Tab'); expect(document.activeElement).toBe(h.first)
    h.first.remove(); key(h.panel, 'Tab'); expect(document.activeElement).toBe(h.panel)
  })

  it('recovers Tab containment after the focused dialog control is removed', () => {
    const h = fixture()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: h.first, requestClose: () => h.controller.close() })

    h.first.remove()
    expect(document.activeElement).toBe(document.body)
    key(document.body, 'Tab')

    expect(document.activeElement).toBe(h.last)
  })

  it('routes a body-origin Tab only to the topmost nested dialog', () => {
    const outer = fixture()
    outer.controller.open({ panel: outer.panel, labelledBy: 'dialog-title', requestClose: () => outer.controller.close() })

    const innerPanel = document.createElement('section')
    const innerTitle = document.createElement('h2'); innerTitle.id = 'inner-dialog-title'; innerTitle.textContent = 'Inner'
    const innerFirst = document.createElement('button'); innerFirst.textContent = 'Inner first'
    const innerLast = document.createElement('button'); innerLast.textContent = 'Inner last'
    innerPanel.append(innerTitle, innerFirst, innerLast); document.body.appendChild(innerPanel)
    const inner = new DialogController(vi.fn())
    inner.open({ panel: innerPanel, labelledBy: innerTitle.id, initialFocus: innerFirst, requestClose: () => inner.close() })

    innerFirst.remove()
    expect(document.activeElement).toBe(document.body)
    key(document.body, 'Tab')

    expect(document.activeElement).toBe(innerLast)
    expect(document.activeElement).not.toBe(outer.first)
  })

  it('restores a usable opener and falls back when it is detached or hidden', () => {
    const h = fixture()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    h.controller.close(); expect(document.activeElement).toBe(h.opener); expect(h.fallback).not.toHaveBeenCalled()
    h.opener.focus(); h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    h.opener.remove(); h.controller.close(); expect(h.fallback).toHaveBeenCalledTimes(1)
    const hidden = fixture(); hidden.controller.open({ panel: hidden.panel, labelledBy: 'dialog-title', requestClose: () => hidden.controller.close() })
    const hiddenAncestor = document.createElement('div'); hidden.opener.before(hiddenAncestor); hiddenAncestor.append(hidden.opener)
    hiddenAncestor.setAttribute('aria-hidden', 'true')
    hidden.controller.close(); expect(hidden.fallback).toHaveBeenCalledTimes(1)
  })

  it('keeps the original opener across re-entrant open and closes idempotently', () => {
    const h = fixture(); const second = document.createElement('button'); document.body.appendChild(second)
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    second.focus()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: h.last, requestClose: () => h.controller.close() })
    expect(openCount()).toBe(baseline + 1)
    h.controller.close(); h.controller.close()
    expect(document.activeElement).toBe(h.opener)
    expect(openCount()).toBe(baseline)
  })

  it('lets a component veto the first Escape without corrupting its overlay slot', () => {
    const h = fixture(); let recording = true
    h.controller.open({
      panel: h.panel,
      labelledBy: 'dialog-title',
      requestClose: () => { if (recording) recording = false; else h.controller.close() },
    })
    escape(); expect(h.controller.isOpen()).toBe(true); expect(openCount()).toBe(baseline + 1)
    escape(); expect(h.controller.isOpen()).toBe(false); expect(openCount()).toBe(baseline)
  })
})
