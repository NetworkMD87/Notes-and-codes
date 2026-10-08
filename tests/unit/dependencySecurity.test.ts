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

describe('shipped dependency security floors', () => {
  it.each([
    { packageName: 'dompurify', patchedMinimum: '3.4.16' },
    { packageName: 'linkify-it', patchedMinimum: '5.0.2' },
    // GHSA-253c-mchw-3w2r: markdown-it itself also has quadratic linkification paths.
    { packageName: 'markdown-it', patchedMinimum: '14.3.1' },
    // Electron is a devDependency but its runtime ships in the packaged app.
    { packageName: 'electron', patchedMinimum: '43.7.7' },
  ])('$packageName resolves at or above $patchedMinimum', ({ packageName, patchedMinimum }) => {
    const version = lock.packages[`node_modules/${packageName}`]?.version
    expect(version, `${packageName} must be present in package-lock.json`).toBeTypeOf('string')
    expect(
      compareVersions(version as string, patchedMinimum),
      `${packageName}@${version} is below patched minimum ${patchedMinimum}`,
    ).toBeGreaterThanOrEqual(0)
  })
})

describe('development dependency security floors', () => {
  // Check every nested resolution: builder's archive/glob helpers use multiple majors.
  it.each([
    { packageName: 'brace-expansion', floors: { 1: '1.1.21', 2: '2.1.7', 5: '5.0.12' } },
    { packageName: 'js-yaml', floors: { 4: '4.3.2' } },
    { packageName: '@xmldom/xmldom', floors: { 0: '0.8.15' } },
    { packageName: 'fast-uri', floors: { 3: '3.1.8' } },
    { packageName: 'undici', floors: { 6: '6.28.1', 7: '7.29.1' } },
    { packageName: 'tar', floors: { 7: '7.5.22' } },
    { packageName: 'builder-util-runtime', floors: { 9: '9.7.0' } },
    { packageName: 'vitest', floors: { 4: '4.1.11' } },
    { packageName: '@vitest/mocker', floors: { 4: '4.1.11' } },
    { packageName: 'sharp', floors: { 0: '0.35.5' } },
    { packageName: 'source-map-js', floors: { 1: '1.2.2' } },
    { packageName: 'browserslist', floors: { 4: '4.28.7' } },
    { packageName: 'baseline-browser-mapping', floors: { 2: '2.11.0' } },
  ])('$packageName has no vulnerable nested resolution', ({ packageName, floors }) => {
    const entries = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${packageName}`),
    )
    expect(entries.length, `${packageName} must be present in package-lock.json`).toBeGreaterThan(0)
    for (const [path, entry] of entries) {
      expect(entry.version, path).toBeTypeOf('string')
      const version = entry.version as string
      const major = numericVersion(version)[0]
      const floor = (floors as Record<number, string>)[major]
      expect(floor, `${path}@${version}: review security floor for new major`).toBeTypeOf('string')
      expect(compareVersions(version, floor), `${path}@${version} is below ${floor}`).toBeGreaterThanOrEqual(0)
    }
  })
})
