import { DialogController } from './dialogController'
import { emptyState, EMPTY_ICONS } from './emptyState'
import { searchBuffers, mergeResults, type SearchableBuffer } from './findInFilesModel'
import { MIN_QUERY_LENGTH } from '../shared/searchText'
import { describeSearchScope, parseScopeField } from '../shared/searchScope'
import { fileType } from './fileType'
import { HL_HEX, type SearchFileResult, type SearchOptions, type SearchScope, type WorkspaceFilter } from '../shared/types'

export interface FindInFilesDeps {
  root: () => string | null
  filter: () => WorkspaceFilter
  workspaceExcludes: () => string[]
  buffers: () => SearchableBuffer[]
  openMatch: (path: string, title: string, line: number, column: number, length: number) => void
  focusEditor: () => void
}

interface Row { file: SearchFileResult; matchIndex: number }

const DEBOUNCE_MS = 150

export class FindInFiles {
  private host: HTMLElement
  private input!: HTMLInputElement
  private listEl!: HTMLElement
  private footEl!: HTMLElement
  private scopeSummaryEl!: HTMLElement
  private dialog: DialogController
  private opts: SearchOptions = { caseSensitive: false, wholeWord: false }
  private results: SearchFileResult[] = []
  private rows: Row[] = []
  private active = 0
  // The query that `results`/`active` currently reflect. Lets runSearch() tell "the same query,
  // re-run" (reopen with a carried-over query; toggling a search option) from "a genuinely new
  // query", and reset the selection only for the latter.
  private resultsQuery = ''
  private query = ''
  private scopeExpanded = false
  private includeText = ''
  private excludeText = ''
  private searching = false
  private truncated = false
  private searchId = 0
  private activeSearchId: number | null = null
  private workspaceGeneration = 0
  private workspaceSuspended = false
  private timer: number | undefined

  constructor(parent: HTMLElement, private d: FindInFilesDeps) {
    this.dialog = new DialogController(d.focusEditor)
    this.host = document.createElement('div')
    this.host.id = 'find-in-files'; this.host.className = 'hidden'
    this.host.addEventListener('mousedown', (e) => { if (e.target === this.host) this.close() })
    parent.appendChild(this.host)
  }

  // Built here rather than in the constructor, like QuickOpen: state that can change while the
  // overlay is shut (folder opened/closed, buffers edited) must be re-read on every open.
  open(): void {
    const box = document.createElement('div'); box.className = 'fif-box'
    const title = document.createElement('h2')
    title.id = 'find-in-files-title'; title.textContent = 'Find in Files'; title.className = 'sr-only'
    const head = document.createElement('div'); head.className = 'fif-head'
    this.input = document.createElement('input')
    this.input.type = 'search'; this.input.setAttribute('aria-label', 'Find in Files')
    this.input.placeholder = 'Find in files…'
    this.input.value = this.query
    head.append(this.input, this.toggle('Aa', 'caseSensitive'), this.toggle('W', 'wholeWord'))

    const scopeToggle = document.createElement('button')
    scopeToggle.type = 'button'
    scopeToggle.className = 'fif-scope-toggle'
    scopeToggle.textContent = 'Search scope'
    scopeToggle.setAttribute('aria-controls', 'find-in-files-scope')
    scopeToggle.setAttribute('aria-expanded', String(this.scopeExpanded))

    const scopeEl = document.createElement('div')
    scopeEl.id = 'find-in-files-scope'
    scopeEl.className = 'fif-scope'
    scopeEl.hidden = !this.scopeExpanded
    scopeEl.setAttribute('role', 'group')
    scopeEl.setAttribute('aria-label', 'Search scope filters')

    const includeField = document.createElement('div'); includeField.className = 'fif-scope-field'
    const includeLabel = document.createElement('label')
    includeLabel.htmlFor = 'find-in-files-include'; includeLabel.textContent = 'Files to include'
    const includeInput = document.createElement('input')
    includeInput.id = includeLabel.htmlFor; includeInput.type = 'text'; includeInput.value = this.includeText
    includeInput.setAttribute('aria-describedby', 'find-in-files-scope-help')
    includeField.append(includeLabel, includeInput)

    const excludeField = document.createElement('div'); excludeField.className = 'fif-scope-field'
    const excludeLabel = document.createElement('label')
    excludeLabel.htmlFor = 'find-in-files-exclude'; excludeLabel.textContent = 'Files to exclude'
    const excludeInput = document.createElement('input')
    excludeInput.id = excludeLabel.htmlFor; excludeInput.type = 'text'; excludeInput.value = this.excludeText
    excludeInput.setAttribute('aria-describedby', 'find-in-files-scope-help')
    excludeField.append(excludeLabel, excludeInput)

    const scopeHelp = document.createElement('p')
    scopeHelp.id = 'find-in-files-scope-help'; scopeHelp.className = 'fif-scope-help'
    scopeHelp.textContent = 'Comma-separated patterns. Empty includes all files. Supports *, ?, and **; braces, character classes, leading !, and escapes are literal.'
    scopeEl.append(includeField, excludeField, scopeHelp)

    this.scopeSummaryEl = document.createElement('div')
    this.scopeSummaryEl.className = 'fif-scope-summary'
    this.scopeSummaryEl.setAttribute('aria-live', 'polite')
    this.scopeSummaryEl.setAttribute('aria-atomic', 'true')
    this.updateScopeSummary()

    scopeToggle.onclick = () => {
      this.scopeExpanded = !this.scopeExpanded
      scopeToggle.setAttribute('aria-expanded', String(this.scopeExpanded))
      scopeEl.hidden = !this.scopeExpanded
    }
    includeInput.addEventListener('input', () => {
      this.includeText = includeInput.value
      this.scopeChanged()
    })
    excludeInput.addEventListener('input', () => {
      this.excludeText = excludeInput.value
      this.scopeChanged()
    })

    this.listEl = document.createElement('div'); this.listEl.className = 'fif-list'
    this.footEl = document.createElement('div'); this.footEl.className = 'fif-note'
    box.append(title, head, scopeToggle, scopeEl, this.scopeSummaryEl, this.listEl, this.footEl)
    this.host.replaceChildren(box)
    this.host.classList.remove('hidden')
    this.dialog.open({ panel: box, labelledBy: title.id, initialFocus: this.input, requestClose: () => this.close() })
    this.input.addEventListener('input', () => {
      this.query = this.input.value
      if (this.query.length < MIN_QUERY_LENGTH) void this.runSearch()
      else this.schedule()
    })
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    // Re-run rather than just redisplay: root()/buffers() may have changed while shut
    // (folder switched, buffer edited), so a carried-over query needs fresh results, not
    // the stale ones left over from before the overlay closed.
    if (this.query.length >= MIN_QUERY_LENGTH) void this.runSearch()
    else this.render()
    this.input.select()
  }

  private scope(): SearchScope {
    return {
      includePatterns: parseScopeField(this.includeText),
      excludePatterns: parseScopeField(this.excludeText),
    }
  }

  private updateScopeSummary(): void {
    const filter = this.d.filter()
    this.scopeSummaryEl.textContent = describeSearchScope(
      this.scope(),
      this.d.workspaceExcludes().length,
      filter.showAll,
    )
  }

  private scopeChanged(): void {
    this.cancelActiveSearch()
    this.active = 0
    this.updateScopeSummary()
    if (this.query.length >= MIN_QUERY_LENGTH) this.schedule()
    else {
      this.results = []
      this.truncated = false
      this.searching = false
      this.render()
    }
  }

  /** Invalidate results captured under an older folder/filter context. `rerun=false` is the
   * synchronous pre-change phase; the commit phase calls again with the new root and reruns. */
  workspaceChanged(rerun = true): void {
    this.workspaceSuspended = !rerun
    this.workspaceGeneration++
    this.cancelActiveSearch()
    clearTimeout(this.timer)
    if (!this.host.classList.contains('hidden')) this.updateScopeSummary()
    if (!rerun || this.host.classList.contains('hidden')) return
    if (this.query.length >= MIN_QUERY_LENGTH) this.schedule()
    else {
      this.results = []
      this.truncated = false
      this.searching = false
      this.render()
    }
  }

  private toggle(label: string, key: keyof SearchOptions): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'fif-toggle' + (this.opts[key] ? ' on' : '')
    b.textContent = label
    b.setAttribute('aria-label', key === 'caseSensitive' ? 'Match case' : 'Whole word')
    b.setAttribute('aria-pressed', String(this.opts[key]))
    b.onclick = () => {
      this.opts = { ...this.opts, [key]: !this.opts[key] }
      b.classList.toggle('on', this.opts[key])
      b.setAttribute('aria-pressed', String(this.opts[key]))
      clearTimeout(this.timer)
      this.runSearch()
      this.input.focus()
    }
    return b
  }

  private schedule(): void {
    clearTimeout(this.timer)
    if (this.workspaceSuspended) return
    this.timer = window.setTimeout(() => void this.runSearch(), DEBOUNCE_MS)
  }

  private cancelActiveSearch(): void {
    if (this.activeSearchId === null) return
    window.api.cancelSearch(this.activeSearchId)
    this.activeSearchId = null
    this.searchId++
  }

  private async runSearch(): Promise<void> {
    if (this.workspaceSuspended) return
    const query = this.query
    const workspaceGeneration = this.workspaceGeneration
    // Arrow-key position only survives a re-run of the SAME query (reopen with a carried-over
    // query, or toggling case/whole-word). A changed query means a different result set, so row
    // N of the old list has nothing to do with row N of the new one — reset before results even
    // arrive, so a stale `active` can't be used mid-flight.
    if (query !== this.resultsQuery) this.active = 0
    this.resultsQuery = query
    if (query.length < MIN_QUERY_LENGTH) {
      this.cancelActiveSearch()
      this.results = []; this.truncated = false; this.searching = false; this.render(); return
    }
    this.cancelActiveSearch()
    const id = ++this.searchId
    const buffers = this.d.buffers()
    const root = this.d.root()
    const filter = this.d.filter()
    const scope = this.scope()
    const bufferResults = searchBuffers(buffers, query, this.opts, root, scope, filter)
    if (!root) {
      this.results = bufferResults; this.truncated = false; this.searching = false; this.render(); return
    }
    this.searching = true
    this.render()
    this.activeSearchId = id
    const headless = new URLSearchParams(window.location.search).get('nc-headless') === '1'
    if (headless) this.host.dataset.lastSearchState = 'started'
    const res = await window.api.searchFiles({
      root, query, opts: this.opts,
      skipPaths: buffers.map(b => b.filePath).filter((p): p is string => !!p),
      filter,
      scope,
      searchId: id,
    })
    if (this.activeSearchId === id) this.activeSearchId = null
    if (id !== this.searchId || workspaceGeneration !== this.workspaceGeneration) {
      if (headless) this.host.dataset.lastSearchState = 'cancelled'
      return
    }
    this.results = mergeResults(bufferResults, res.files)
    this.truncated = res.truncated
    this.searching = false
    this.render()
  }

  private render(): void {
    this.listEl.replaceChildren()
    this.rows = []
    if (this.query.length < MIN_QUERY_LENGTH) {
      this.listEl.appendChild(emptyState('fif-empty', EMPTY_ICONS.search, `Type at least ${MIN_QUERY_LENGTH} characters to search`))
      this.footEl.textContent = ''
      return
    }
    if (this.searching) {
      this.footEl.textContent = 'Searching…'
      return
    }
    if (!this.results.length) {
      this.listEl.appendChild(emptyState('fif-empty', EMPTY_ICONS.search, `No matches for “${this.query}”`))
      this.footEl.textContent = ''
      return
    }
    let total = 0
    for (const file of this.results) {
      this.listEl.appendChild(this.fileRow(file))
      file.matches.forEach((m, i) => {
        const row = document.createElement('div')
        row.className = 'fif-row'
        const ln = document.createElement('span'); ln.className = 'fif-line'; ln.textContent = String(m.line)
        const pv = document.createElement('span'); pv.textContent = m.preview
        row.append(ln, pv)
        const index = this.rows.length
        row.onclick = () => { this.active = index; this.choose() }
        this.rows.push({ file, matchIndex: i })
        this.listEl.appendChild(row)
      })
      total += file.matches.length
    }
    if (this.active >= this.rows.length) this.active = Math.max(0, this.rows.length - 1)
    this.paintActive()
    const files = this.results.length
    this.footEl.textContent =
      `${total} match${total === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}` +
      (this.truncated ? ' — results truncated; narrow your search.' : '')
  }

  private fileRow(file: SearchFileResult): HTMLElement {
    const row = document.createElement('div'); row.className = 'fif-file'
    const label = file.path || file.title || 'Untitled'
    const t = fileType(label.split(/[\\/]/).pop() ?? label)
    const badge = document.createElement('span'); badge.className = 'sb-badge'; badge.textContent = t.label
    if (t.colour) { badge.style.color = HL_HEX[t.colour]; badge.style.background = HL_HEX[t.colour] + '22' }
    const name = document.createElement('span'); name.textContent = this.relative(label)
    const count = document.createElement('span'); count.className = 'fif-file-count'
    count.textContent = String(file.matches.length) + (file.truncated ? '+' : '')
    row.append(badge, name, count)
    return row
  }

  private relative(path: string): string {
    const root = this.d.root()
    return root && path.startsWith(root) ? path.slice(root.length).replace(/^[\\/]/, '') : path
  }

  private paintActive(): void {
    const rows = Array.from(this.listEl.querySelectorAll('.fif-row'))
    rows.forEach((el, i) => el.classList.toggle('active', i === this.active))
    rows[this.active]?.scrollIntoView({ block: 'nearest' })
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active = Math.max(0, Math.min(this.active + 1, this.rows.length - 1)); this.paintActive() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active = Math.max(this.active - 1, 0); this.paintActive() }
    else if (e.key === 'Enter') { e.preventDefault(); this.choose() }
    // Escape handled centrally by overlayManager.
  }

  private choose(): void {
    const row = this.rows[this.active]
    if (!row) return
    const m = row.file.matches[row.matchIndex]
    this.close()
    this.d.openMatch(row.file.path, row.file.title ?? '', m.line, m.column, m.length)
  }

  private close(): void {
    clearTimeout(this.timer)
    this.cancelActiveSearch()
    this.host.classList.add('hidden')
    this.dialog.close()
  }
}
