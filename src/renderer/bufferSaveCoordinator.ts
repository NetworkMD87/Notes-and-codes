export class BufferSaveCoordinator {
  private tails = new Map<string, Promise<void>>()

  run<T>(bufferId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(bufferId) ?? Promise.resolve()
    const current = previous.then(operation, operation)
    const tail = current.then(() => undefined, () => undefined)
    this.tails.set(bufferId, tail)
    void tail.then(() => {
      if (this.tails.get(bufferId) === tail) this.tails.delete(bufferId)
    })
    return current
  }
}
