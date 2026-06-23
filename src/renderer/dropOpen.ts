export function installDropOpen(open: (path: string) => void): void {
  window.addEventListener('dragover', (e) => { e.preventDefault() })
  window.addEventListener('drop', (e) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return
    for (const file of Array.from(files)) {
      const path = window.api.pathForDroppedFile(file)
      if (path) open(path)
    }
  })
}
