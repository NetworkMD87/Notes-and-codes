'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

async function main() {
  const [url, timeoutMs, trustCertPath] = process.argv.slice(2)
  const appBuilderRequire = createRequire(require.resolve('app-builder-lib'))
  const getEntry = appBuilderRequire.resolve('@electron/get')
  const getRequire = createRequire(getEntry)
  const getRoot = path.resolve(path.dirname(getEntry), '..', '..')
  const getVersion = JSON.parse(fs.readFileSync(path.join(getRoot, 'package.json'), 'utf8')).version
  const globalAgentVersion = getRequire('global-agent/package.json').version
  const electronGet = getRequire(getEntry)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-get-proxy-test-'))

  try {
    electronGet.initializeProxy()
    const downloadOptions = { quiet: true }
    if (timeoutMs) downloadOptions.timeout = { request: Number(timeoutMs) }
    if (trustCertPath) {
      downloadOptions.https = { certificateAuthority: fs.readFileSync(trustCertPath) }
    }

    const resultPath = await electronGet.downloadArtifact({
      isGeneric: true,
      version: '1.0.0',
      artifactName: 'proxy-test.bin',
      mirrorOptions: { resolveAssetURL: async () => url },
      cacheMode: electronGet.ElectronDownloadCacheMode.Bypass,
      cacheRoot: path.join(tempRoot, 'cache'),
      tempDirectory: tempRoot,
      unsafelyDisableChecksums: true,
      downloadOptions,
    })
    const payload = fs.readFileSync(resultPath, 'utf8')
    process.stdout.write(`PROXY_CHILD_RESULT ${JSON.stringify({ getVersion, globalAgentVersion, payload })}\n`)
  } catch (error) {
    process.stderr.write(`PROXY_CHILD_FAILURE ${JSON.stringify({
      name: error && error.name,
      code: error && error.code,
      message: error && error.message,
    })}\n`)
    process.exitCode = 2
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch(error => {
  process.stderr.write(`PROXY_CHILD_FATAL ${error && error.stack || error}\n`)
  process.exitCode = 3
})
