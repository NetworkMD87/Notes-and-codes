export async function settleQuitWrites(
  writes: Promise<unknown>[],
  onRejected: (reason: unknown) => void,
): Promise<void> {
  const results = await Promise.allSettled(writes)
  for (const result of results) {
    if (result.status === 'rejected') onRejected(result.reason)
  }
}
