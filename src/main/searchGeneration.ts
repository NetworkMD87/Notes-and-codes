export class SearchGeneration {
  private generation = 0
  private active: { searchId: number; generation: number } | null = null

  begin(searchId: number): () => boolean {
    const current = ++this.generation
    this.active = { searchId, generation: current }
    return () => current !== this.generation
  }

  cancel(searchId: number): void {
    if (!this.active || this.active.searchId !== searchId) return
    this.generation++
    this.active = null
  }
}
