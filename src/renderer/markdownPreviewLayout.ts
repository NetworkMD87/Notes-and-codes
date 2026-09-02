import Split from 'split.js'
import type {
  MarkdownPreviewMode,
  MarkdownPreviewVisibleMode,
  Settings,
} from '../shared/types'

const DEFAULT_WIDTH = 50
const MIN_PERCENT = 20
const MAX_PERCENT = 80
const MIN_PIXELS = 160
const GUTTER_SIZE = 6
const KEYBOARD_STEP = 5

const visible = (mode: MarkdownPreviewMode): mode is MarkdownPreviewVisibleMode => mode !== 'off'
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export interface MarkdownPreviewLayoutState {
  remember: boolean
  requestedMode: MarkdownPreviewMode
  lastVisibleMode: MarkdownPreviewVisibleMode
  previewWidthPercent: number
}

export interface MarkdownPreviewLayoutDeps {
  focusEditor(): void
  layoutEditors(): void
  persist(state: MarkdownPreviewLayoutState): Promise<void>
  warn(message: string): void
  createSplit?: typeof Split
}

export class MarkdownPreviewLayout {
  private readonly createSplit: typeof Split
  private stateValue: MarkdownPreviewLayoutState = {
    remember: false,
    requestedMode: 'off',
    lastVisibleMode: 'side-by-side',
    previewWidthPercent: DEFAULT_WIDTH,
  }
  private bufferIsMarkdown = false
  private appliedMode: MarkdownPreviewMode | null = null
  private split: Split.Instance | null = null
  private gutter: HTMLElement | null = null
  private disposed = false

  constructor(
    private readonly root: HTMLElement,
    private readonly editorGroup: HTMLElement,
    private readonly preview: HTMLElement,
    private readonly deps: MarkdownPreviewLayoutDeps,
  ) {
    this.createSplit = deps.createSplit ?? Split
  }

  restore(settings: Pick<Settings,
    | 'rememberMarkdownPreviewMode'
    | 'markdownPreviewMode'
    | 'markdownPreviewLastVisibleMode'
    | 'markdownPreviewWidthPercent'>, isMarkdown: boolean): void {
    this.disposed = false
    this.bufferIsMarkdown = isMarkdown
    this.stateValue = settings.rememberMarkdownPreviewMode
      ? {
          remember: true,
          requestedMode: settings.markdownPreviewMode,
          lastVisibleMode: settings.markdownPreviewLastVisibleMode,
          previewWidthPercent: clamp(settings.markdownPreviewWidthPercent, MIN_PERCENT, MAX_PERCENT),
        }
      : {
          remember: false,
          requestedMode: 'off',
          lastVisibleMode: 'side-by-side',
          previewWidthPercent: DEFAULT_WIDTH,
        }
    this.apply()
  }

  state(): MarkdownPreviewLayoutState {
    return { ...this.stateValue }
  }

  effectiveMode(): MarkdownPreviewMode {
    return this.isAvailable() ? this.stateValue.requestedMode : 'off'
  }

  isAvailable(): boolean {
    return this.bufferIsMarkdown
  }

  setBufferIsMarkdown(isMarkdown: boolean): void {
    if (this.bufferIsMarkdown === isMarkdown) return
    this.bufferIsMarkdown = isMarkdown
    this.apply()
  }

  selectMode(mode: MarkdownPreviewMode): boolean {
    if (!this.isAvailable()) return false
    if (this.stateValue.requestedMode === mode) return true
    this.stateValue.requestedMode = mode
    if (visible(mode)) this.stateValue.lastVisibleMode = mode
    this.apply()
    this.persistIfRemembering()
    return true
  }

  toggle(): boolean {
    return this.selectMode(this.stateValue.requestedMode === 'off'
      ? this.stateValue.lastVisibleMode
      : 'off')
  }

  setRemember(remember: boolean): void {
    if (this.stateValue.remember === remember) return
    this.stateValue.remember = remember
    this.persistSnapshot()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.destroySplit()
    this.appliedMode = null
  }

  private apply(): void {
    if (this.disposed) return
    const next = this.effectiveMode()
    if (next === this.appliedMode) return
    const restoreEditorFocus = this.appliedMode === 'focus' || next === 'off'
    this.destroySplit()
    this.root.dataset.markdownPreviewMode = next
    this.editorGroup.classList.toggle('hidden', next === 'focus')
    this.preview.classList.toggle('hidden', next === 'off')

    if (next === 'side-by-side') this.createOuterSplit()
    if (next === 'focus') {
      this.preview.tabIndex = 0
      this.preview.focus({ preventScroll: true })
    } else {
      this.preview.removeAttribute('tabindex')
      if (restoreEditorFocus) queueMicrotask(() => this.deps.focusEditor())
    }
    this.appliedMode = next
    this.deps.layoutEditors()
  }

  private createOuterSplit(): void {
    const width = this.stateValue.previewWidthPercent
    this.split = this.createSplit([this.editorGroup, this.preview], {
      sizes: [100 - width, width],
      minSize: [MIN_PIXELS, MIN_PIXELS],
      gutterSize: GUTTER_SIZE,
      elementStyle: (_dimension, size, gutterSize) => ({
        'flex-basis': `calc(${size}% - ${gutterSize}px)`,
      }),
      gutterStyle: (_dimension, gutterSize) => ({ 'flex-basis': `${gutterSize}px` }),
      gutter: () => this.createGutter(),
      onDrag: () => this.deps.layoutEditors(),
      onDragEnd: sizes => this.acceptPreviewWidth(sizes[1]),
    })
  }

  private destroySplit(): void {
    this.split?.destroy()
    this.split = null
    this.editorGroup.style.flexBasis = ''
    this.preview.style.flexBasis = ''
    if (this.gutter) {
      this.gutter.removeEventListener('keydown', this.onGutterKeydown)
      this.gutter = null
    }
  }

  private createGutter(): HTMLElement {
    const gutter = document.createElement('div')
    gutter.className = 'gutter gutter-horizontal markdown-preview-gutter'
    gutter.tabIndex = 0
    gutter.setAttribute('role', 'separator')
    gutter.setAttribute('aria-label', 'Resize Markdown preview')
    gutter.setAttribute('aria-orientation', 'vertical')
    gutter.addEventListener('keydown', this.onGutterKeydown)
    this.gutter = gutter
    this.syncGutterAria()
    return gutter
  }

  private readonly onGutterKeydown = (event: KeyboardEvent): void => {
    const [minimum, maximum] = this.runtimeBounds()
    let width: number | null = null
    if (event.key === 'ArrowLeft') width = this.stateValue.previewWidthPercent + KEYBOARD_STEP
    if (event.key === 'ArrowRight') width = this.stateValue.previewWidthPercent - KEYBOARD_STEP
    if (event.key === 'Home') width = minimum
    if (event.key === 'End') width = maximum
    if (width === null) return
    event.preventDefault()
    this.acceptPreviewWidth(clamp(width, minimum, maximum))
  }

  private runtimeBounds(): [number, number] {
    const availableWidth = this.root.clientWidth - GUTTER_SIZE
    if (availableWidth < MIN_PIXELS * 2) return [DEFAULT_WIDTH, DEFAULT_WIDTH]
    const pixelMinimum = (MIN_PIXELS / availableWidth) * 100
    return [
      clamp(MIN_PERCENT, pixelMinimum, MAX_PERCENT),
      clamp(MAX_PERCENT, MIN_PERCENT, 100 - pixelMinimum),
    ]
  }

  private acceptPreviewWidth(width: number): void {
    const [minimum, maximum] = this.runtimeBounds()
    const accepted = clamp(width, minimum, maximum)
    this.split?.setSizes([100 - accepted, accepted])
    this.stateValue.previewWidthPercent = accepted
    this.syncGutterAria()
    this.deps.layoutEditors()
    this.persistIfRemembering()
  }

  private syncGutterAria(): void {
    if (!this.gutter) return
    const [minimum, maximum] = this.runtimeBounds()
    const width = clamp(this.stateValue.previewWidthPercent, minimum, maximum)
    this.gutter.setAttribute('aria-valuemin', String(Math.round(minimum)))
    this.gutter.setAttribute('aria-valuemax', String(Math.round(maximum)))
    this.gutter.setAttribute('aria-valuenow', String(Math.round(width)))
    this.gutter.setAttribute('aria-valuetext', `${Math.round(width)}% preview`)
  }

  private persistIfRemembering(): void {
    if (this.stateValue.remember) this.persistSnapshot()
  }

  private persistSnapshot(): void {
    void this.deps.persist(this.state()).catch(() => {
      this.deps.warn('Could not save the Markdown preview preference.')
    })
  }
}
