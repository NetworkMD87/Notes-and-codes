import type { Snippet } from '../shared/types'

export class SnippetList {
  private items: Snippet[] = []
  constructor(private idFactory: () => string) {}

  add(name: string, body: string): Snippet {
    const snip: Snippet = { id: this.idFactory(), name, body }
    this.items.push(snip)
    return snip
  }
  rename(id: string, name: string): void { const s = this.get(id); if (s) s.name = name }
  updateBody(id: string, body: string): void { const s = this.get(id); if (s) s.body = body }
  remove(id: string): void { this.items = this.items.filter(s => s.id !== id) }
  get(id: string): Snippet | undefined { return this.items.find(s => s.id === id) }
  list(): Snippet[] { return this.items }
  load(items: Snippet[]): void { this.items = items }
}
