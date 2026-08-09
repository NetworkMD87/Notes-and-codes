export interface SearchLease {
  shouldCancel: () => boolean
  complete: () => void
}

export class SearchGeneration {
  private generation = 0
  private active: { searchId: number; generation: number } | null = null

  begin(searchId: number): SearchLease {
    const current = ++this.generation
    this.active = { searchId, generation: current }
    return {
      shouldCancel: () => current !== this.generation,
      complete: () => {
        if (this.active?.generation === current) this.active = null
      },
    }
  }

  cancel(searchId: number): void {
    if (!this.active || this.active.searchId !== searchId) return
    this.generation++
    this.active = null
  }
}
