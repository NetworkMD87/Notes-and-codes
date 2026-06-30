import type { Highlight, HighlightColour } from '../shared/types'
import { applyStroke } from './highlights'

export class HighlightManager {
  private sets = new Map<string, Highlight[]>()
  private on = false
  private active: HighlightColour = 'yellow'

  isOn(): boolean { return this.on }
  setMode(on: boolean): void { this.on = on }
  toggleMode(): boolean { this.on = !this.on; return this.on }

  colour(): HighlightColour { return this.active }
  setColour(c: HighlightColour): void { this.active = c }

  get(bufferId: string): Highlight[] { return this.sets.get(bufferId) ?? [] }

  /** Seed silently on open. */
  load(bufferId: string, hs: Highlight[]): void { this.sets.set(bufferId, hs) }

  /** Update canonical offsets silently (edit-tracking read-back). */
  sync(bufferId: string, hs: Highlight[]): void { this.sets.set(bufferId, hs) }

  /** Apply a drag stroke in the active colour; returns the new set. */
  paint(bufferId: string, range: { start: number; end: number }): Highlight[] {
    const next = applyStroke(this.get(bufferId), range, this.active)
    this.sets.set(bufferId, next)
    return next
  }

  clear(bufferId: string): Highlight[] { this.sets.set(bufferId, []); return [] }
  forget(bufferId: string): void { this.sets.delete(bufferId) }
}
