export class PasteHistoryList {
  private items: string[] = []
  constructor(private cap = 50, private maxLen = 1_000_000) {}

  add(text: string): void {
    if (!text || !text.trim()) return
    const value = text.length > this.maxLen ? text.slice(0, this.maxLen) + ' …[truncated]' : text
    this.items = [value, ...this.items.filter(x => x !== value)].slice(0, this.cap)
  }

  entries(): string[] { return this.items }
  clear(): void { this.items = [] }
  load(entries: string[]): void {
    this.items = []
    for (let i = entries.length - 1; i >= 0; i--) this.add(entries[i])
  }
}
