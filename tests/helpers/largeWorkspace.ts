import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LARGE_WORKSPACE_FILES = 20_000

export function createLargeWorkspace(root: string, fileCount = LARGE_WORKSPACE_FILES): void {
  for (let packageIndex = 0; packageIndex < Math.ceil(fileCount / 100); packageIndex++) {
    const packageName = `pkg-${String(packageIndex).padStart(3, '0')}`
    const src = join(root, 'packages', packageName, 'src')
    mkdirSync(src, { recursive: true })
    const start = packageIndex * 100
    const end = Math.min(fileCount, start + 100)
    for (let index = start; index < end; index++) {
      const name = index === 12_345
        ? 'workspace-target.ts'
        : `file-${String(index).padStart(5, '0')}.ts`
      writeFileSync(join(src, name), `export const value${index} = ${index}\n`)
    }
  }
  const excluded = join(root, 'packages', 'pkg-000', 'dist')
  mkdirSync(excluded, { recursive: true })
  writeFileSync(join(excluded, 'excluded-target.ts'), 'export const excluded = true\n')
}
