export class BufferSaveCoordinator {
  private tails = new Map<string, Promise<void>>()

  run<T>(bufferId: string | readonly string[], operation: () => Promise<T>): Promise<T> {
    const ids = typeof bufferId === 'string' ? [bufferId] : [...new Set(bufferId)]
    const pending = ids.map(id => this.tails.get(id) ?? Promise.resolve())
    const previous = pending.length === 1 ? pending[0] : Promise.all(pending)
    const current = previous.then(operation, operation)
    const tail = current.then(() => undefined, () => undefined)
    // Reserve every queue synchronously, before waiting on any of them. Nested per-buffer
    // acquisition can deadlock overlapping folder renames that request ids in another order.
    for (const id of ids) this.tails.set(id, tail)
    void tail.then(() => {
      for (const id of ids) {
        if (this.tails.get(id) === tail) this.tails.delete(id)
      }
    })
    return current
  }
}
