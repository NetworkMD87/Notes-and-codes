export type RovingOrientation = 'vertical' | 'horizontal'

export function moveRovingIndex(
  current: number,
  enabled: readonly boolean[],
  key: string,
  orientation: RovingOrientation,
): number | null {
  const first = enabled.findIndex(Boolean)
  if (first < 0) return null
  if (key === 'Home') return first
  if (key === 'End') {
    for (let i = enabled.length - 1; i >= 0; i--) if (enabled[i]) return i
  }
  const forward = orientation === 'vertical' ? key === 'ArrowDown' : key === 'ArrowRight'
  const backward = orientation === 'vertical' ? key === 'ArrowUp' : key === 'ArrowLeft'
  if (!forward && !backward) return null
  const direction = forward ? 1 : -1
  for (let step = 1; step <= enabled.length; step++) {
    const index = (current + direction * step + enabled.length) % enabled.length
    if (enabled[index]) return index
  }
  return first
}
