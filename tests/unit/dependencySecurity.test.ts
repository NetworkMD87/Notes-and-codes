import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const lock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string }>
}

function numericVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Expected a stable numeric package version, received ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = numericVersion(leftVersion)
  const right = numericVersion(rightVersion)
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

describe('production dependency security floors', () => {
  it.each([
    { packageName: 'dompurify', patchedMinimum: '3.4.13' },
    { packageName: 'linkify-it', patchedMinimum: '5.0.2' },
  ])('$packageName resolves at or above $patchedMinimum', ({ packageName, patchedMinimum }) => {
    const version = lock.packages[`node_modules/${packageName}`]?.version
    expect(version, `${packageName} must be present in package-lock.json`).toBeTypeOf('string')
    expect(
      compareVersions(version as string, patchedMinimum),
      `${packageName}@${version} is below patched minimum ${patchedMinimum}`,
    ).toBeGreaterThanOrEqual(0)
  })
})
