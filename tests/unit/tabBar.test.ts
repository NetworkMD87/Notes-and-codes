// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from '../../src/renderer/tabBar'
import type { BufferState } from '../../src/shared/types'

const buffer = (id: string): BufferState => ({
  id, title: `${id}.txt`, filePath: null, content: '', language: 'plaintext',
  eol: 'LF', encoding: 'utf8', dirty: false,
})

describe('TabBar', () => {
  afterEach(() => document.body.replaceChildren())
  it('renders corrupt-session paths as unsaved identities without losing tab content', () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    const items = [42, {}].map((path, index) =>
      ({ ...buffer(`bad-${index}`), title: 'note.txt', filePath: path, content: 'retained text' }) as unknown as BufferState)
    bar.render(items, items[0].id)
    expect([...host.querySelectorAll<HTMLButtonElement>('.tab-select')].map(tab => tab.title)).toEqual(['note.txt', 'note.txt'])
    expect([...host.querySelectorAll('.tab-select')].map(tab => tab.getAttribute('aria-label'))).toEqual(['note.txt', 'note.txt'])
    expect([...host.querySelectorAll<HTMLElement>('.tab-folder')].every(folder => folder.hidden)).toBe(true)
    expect(items.map(item => item.content)).toEqual(['retained text', 'retained text'])
  })
  it('keeps the new-tab control when rendering an empty list', () => {
    const host = document.createElement('div'); const onNew = vi.fn()
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew, onReorder: vi.fn() })
    bar.render([], null)
    host.querySelector<HTMLButtonElement>('.tab-add')!.click()
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('moves keyboard focus when activation reuses the current controls', async () => {
    const host = document.createElement('div'); document.body.append(host)
    const items = ['a', 'b'].map(buffer)
    const bar = new TabBar(host, { onSelect: id => bar.render(items, id), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    bar.render(items, 'a'); bar.focusTab('a')
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('tab-b')
  })

  it('updates tab state without replacing controls or disturbing focus and scroll', () => {
    const host = document.createElement('div'); document.body.append(host)
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    const items = ['a', 'b'].map(buffer)
    bar.render(items, 'a')
    const controls = [...host.querySelectorAll('button')]
    controls[0].focus(); host.scrollLeft = 40
    items[0].dirty = true
    bar.updateTab(items[0])
    expect(host.querySelector('.tab-title')?.textContent).toBe('● a.txt')
    expect([...host.querySelectorAll('button')]).toEqual(controls)
    expect(document.activeElement).toBe(controls[0])
    expect(host.scrollLeft).toBe(40)
    const observer = new MutationObserver(() => {})
    observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
    bar.updateTab(items[0])
    expect(observer.takeRecords()).toHaveLength(0)
    observer.disconnect()
    items[0].dirty = false; items[0].title = 'renamed.ts'; items[0].language = 'typescript'
    bar.render(items, 'b')
    expect([...host.querySelectorAll('button')]).toEqual(controls)
    expect(controls[0].title).toBe('renamed.ts')
    expect(controls[1].getAttribute('aria-label')).toBe('Close renamed.ts')
    expect(controls[2].getAttribute('aria-selected')).toBe('true')
    expect(host.querySelector('.tab-title')?.textContent).toBe('renamed.ts')
    expect(host.querySelector('.badge')?.textContent).toBe('ts')
    host.remove()
  })

  it('renders a tablist with sibling tab and close buttons and one roving target', () => {
    const host = document.createElement('div'); const onSelect = vi.fn()
    const bar = new TabBar(host, { onSelect, onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    bar.render([buffer('a'), buffer('b')], 'a')

    expect(host.getAttribute('role')).toBe('tablist')
    expect(host.getAttribute('aria-label')).toBe('Open files')
    const wrappers = [...host.querySelectorAll<HTMLElement>('.tab')]
    expect(wrappers.every(row => row.getAttribute('role') === 'presentation')).toBe(true)
    expect(wrappers[0].children[0].getAttribute('role')).toBe('tab')
    expect(wrappers[0].querySelector('.tab-select')?.contains(wrappers[0].querySelector('.tab-close'))).toBe(false)
    expect([...host.querySelectorAll('[role="tab"]')].filter(tab => (tab as HTMLElement).tabIndex === 0)).toHaveLength(1)
    expect(host.querySelector('.tab-close')?.getAttribute('aria-label')).toBe('Close a.txt')
  })

  it('defaults to bounded sizing and exposes the full filename when the visible title truncates', () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    const longTitle = 'a-very-long-filename-that-needs-to-be-truncated-without-losing-its-extension.ts'
    const item = { ...buffer('long'), title: longTitle, language: 'typescript' }

    bar.render([item], item.id)

    const select = host.querySelector<HTMLButtonElement>('.tab-select')
    expect(host.dataset.tabSizing).toBe('bounded')
    expect(select?.title).toBe(longTitle)
    expect(select?.getAttribute('aria-label')).toBe(longTitle)
  })

  it('switches the tab strip to natural sizing without rebuilding its tabs', () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    bar.render([buffer('a')], 'a')
    const tab = host.querySelector('.tab')

    bar.setSizing('natural')

    expect(host.dataset.tabSizing).toBe('natural')
    expect(host.querySelector('.tab')).toBe(tab)
  })

  it('updates duplicate folders, full paths, and unsaved labels while retaining controls on edits', () => {
    const host = document.createElement('div'); document.body.append(host)
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    const items = [
      { ...buffer('a'), title: 'README.md', filePath: 'C:\\work\\client\\README.md' },
      { ...buffer('b'), title: 'README.md', filePath: 'C:\\work\\server\\README.md' },
    ]
    bar.render(items, 'a')
    const controls = [...host.querySelectorAll('button')]
    const select = host.querySelector<HTMLButtonElement>('#tab-a')!
    expect([...host.querySelectorAll('.tab-folder')].map(el => el.textContent)).toEqual(['client', 'server'])
    expect(select.title).toBe(items[0].filePath)
    expect(select.getAttribute('aria-label')).toBe('README.md, C:\\work\\client\\README.md')
    expect(controls[1].getAttribute('aria-label')).toBe('Close README.md, C:\\work\\client\\README.md')

    select.focus(); host.scrollLeft = 50; items[0].dirty = true
    bar.updateTab(items[0])
    expect(select.title).toBe('C:\\work\\client\\README.md\nUnsaved changes')
    expect(select.getAttribute('aria-label')).toBe('README.md, C:\\work\\client\\README.md, Unsaved changes')
    expect([...host.querySelectorAll('button')]).toEqual(controls)
    expect(document.activeElement).toBe(select)
    expect(host.scrollLeft).toBe(50)
    const observer = new MutationObserver(() => {})
    observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
    bar.updateTab(items[0])
    expect(observer.takeRecords()).toHaveLength(0)
    observer.disconnect()

    // Save As / rename can change identity with the same buffer IDs and tab nodes.
    items[0].filePath = 'C:\\work\\web\\README.md'; items[0].dirty = false
    bar.render(items, 'a')
    expect([...host.querySelectorAll('button')]).toEqual(controls)
    expect(host.querySelector('.tab-folder')?.textContent).toBe('web')
    expect(select.title).toBe(items[0].filePath)
    expect(select.getAttribute('aria-label')).not.toContain('Unsaved changes')
    items[1].title = 'OTHER.md'; items[1].filePath = 'C:\\work\\server\\OTHER.md'
    bar.render(items, 'a')
    expect([...host.querySelectorAll<HTMLElement>('.tab-folder')].every(el => el.hidden)).toBe(true)
    items[1].title = 'README.md'; items[1].filePath = 'C:\\work\\server\\README.md'
    bar.render(items, 'a')
    expect(host.querySelector<HTMLElement>('.tab-folder')?.hidden).toBe(false)
    bar.render([items[0]], 'a')
    expect(host.querySelector<HTMLElement>('.tab-folder')?.hidden).toBe(true)
  })

  it('exposes unsaved status for untitled tabs without inventing a path', () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    const item = { ...buffer('scratch'), title: 'Untitled-1', dirty: true }
    bar.render([item], item.id)
    const select = host.querySelector<HTMLButtonElement>('[role=tab]')!
    expect(select.title).toBe('Untitled-1\nUnsaved changes')
    expect(select.getAttribute('aria-label')).toBe('Untitled-1, Unsaved changes')
    expect(host.querySelector<HTMLElement>('.tab-folder')?.hidden).toBe(true)
  })

  it('Left, Right, Home, and End wrap, activate, and focus the destination tab', async () => {
    const host = document.createElement('div'); let active = 'a'; const items = ['a', 'b', 'c'].map(buffer)
    document.body.append(host)
    let bar!: TabBar
    const render = (id: string) => { active = id; bar.render(items, active); bar.focusTab(id) }
    bar = new TabBar(host, { onSelect: render, onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    render('a')

    host.querySelector<HTMLElement>('#tab-a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('tab-c')
    expect(host.querySelector('#tab-c')?.getAttribute('aria-selected')).toBe('true')
    ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('tab-a')
    ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('tab-c')
    ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()
    expect(document.activeElement?.id).toBe('tab-a')
  })

  it('does not steal focus when tab activation deliberately moves it outside the tablist', async () => {
    const host = document.createElement('div')
    const focusTarget = document.createElement('button')
    document.body.append(host, focusTarget)
    const items = ['a', 'b'].map(buffer)
    let bar!: TabBar
    bar = new TabBar(host, {
      onSelect: id => {
        bar.render(items, id)
        focusTarget.focus()
      },
      onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn(),
    })
    bar.render(items, 'a')
    const first = host.querySelector<HTMLElement>('.tab-select')
    expect(first).not.toBeNull()
    first!.focus()

    first!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await Promise.resolve()

    expect(document.activeElement).toBe(focusTarget)
    expect(host.querySelector('.tab-select[data-id="b"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('keeps only the selected close button in the sequential tab order', () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
    bar.render(['a', 'b', 'c'].map(buffer), 'b')

    const closes = [...host.querySelectorAll<HTMLButtonElement>('.tab-close')]
    expect(closes.map(close => close.tabIndex)).toEqual([-1, 0, -1])
  })

  it('keeps middle-click close on the draggable presentation wrapper', () => {
    const host = document.createElement('div'); const onClose = vi.fn()
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose, onNew: vi.fn(), onReorder: vi.fn() })
    bar.render(['a', 'b'].map(buffer), 'a')
    host.querySelector<HTMLElement>('.tab[data-id="b"]')!.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true }))

    expect(onClose).toHaveBeenCalledWith('b')
  })

  it('keyboard close focuses the newly selected neighbour after an async re-render', async () => {
    const host = document.createElement('div'); const items = ['a', 'b', 'c'].map(buffer); let active = 'b'
    document.body.append(host)
    let bar!: TabBar
    const close = async (id: string) => {
      const index = items.findIndex(item => item.id === id)
      items.splice(index, 1); active = 'c'; bar.render(items, active)
    }
    bar = new TabBar(host, { onSelect: vi.fn(), onClose: close, onNew: vi.fn(), onReorder: vi.fn() })
    bar.render(items, active)
    const closeButton = host.querySelector<HTMLButtonElement>('.tab[data-id="b"] .tab-close')!
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    await Promise.resolve()

    expect(document.activeElement?.id).toBe('tab-c')
  })

  it('leaves a valid roving target when a close is cancelled', async () => {
    const host = document.createElement('div')
    const bar = new TabBar(host, { onSelect: vi.fn(), onClose: async () => undefined, onNew: vi.fn(), onReorder: vi.fn() })
    bar.render(['a', 'b'].map(buffer), 'a')
    host.querySelector<HTMLButtonElement>('.tab[data-id="a"] .tab-close')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
    await Promise.resolve()

    expect(host.querySelectorAll<HTMLElement>('[role="tab"][tabindex="0"]')).toHaveLength(1)
    expect(host.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')?.id).toBe('tab-a')
  })

  it('keeps the selected tab as the sole roving target after reorder', () => {
    const host = document.createElement('div'); const items = ['a', 'b', 'c'].map(buffer); let active = 'b'
    let bar!: TabBar
    const reorder = (id: string, toIndex: number) => {
      const from = items.findIndex(item => item.id === id)
      const [item] = items.splice(from, 1); items.splice(toIndex, 0, item); bar.render(items, active)
    }
    bar = new TabBar(host, { onSelect: vi.fn(), onClose: vi.fn(), onNew: vi.fn(), onReorder: reorder })
    bar.render(items, active)
    ;(bar as unknown as { handlers: { onReorder: (id: string, toIndex: number) => void } }).handlers.onReorder('c', 0)

    expect([...host.querySelectorAll<HTMLElement>('[role="tab"]')].filter(tab => tab.tabIndex === 0).map(tab => tab.id)).toEqual(['tab-b'])
  })
})
