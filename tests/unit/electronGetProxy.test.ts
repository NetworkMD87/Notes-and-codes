import { spawn } from 'node:child_process'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import { connect as connectTcp, type Socket } from 'node:net'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const appBuilderRequire = createRequire(require.resolve('app-builder-lib'))
const getEntry = appBuilderRequire.resolve('@electron/get')
const getRequire = createRequire(getEntry)
const getRoot = path.resolve(path.dirname(getEntry), '..', '..')
const getVersion = JSON.parse(readFileSync(path.join(getRoot, 'package.json'), 'utf8')).version as string
const globalAgentVersion = getRequire('global-agent/package.json').version as string
const childPath = path.resolve('tests/fixtures/electronGetProxyChild.cjs')
const certificatePath = path.resolve('tests/fixtures/electron-get-proxy-test-cert.pem')
const keyPath = path.resolve('tests/fixtures/electron-get-proxy-test-key.pem')
const testCertificate = readFileSync(certificatePath)
const testPrivateKey = readFileSync(keyPath)

type RunningServer = HttpServer | HttpsServer

const servers: RunningServer[] = []
const sockets = new Set<Socket>()

function trackServer<T extends RunningServer>(server: T): T {
  server.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  servers.push(server)
  return server
}

async function listen(server: RunningServer): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a TCP test server')
  return address.port
}

async function unusedLoopbackPort(): Promise<number> {
  const reservation = trackServer(createHttpServer())
  const port = await listen(reservation)
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  servers.splice(servers.indexOf(reservation), 1)
  return port
}

function closeServers(): Promise<void> {
  for (const socket of sockets) socket.destroy()
  const closing = servers.splice(0).map(server => new Promise<void>(resolve => {
    if (!server.listening) return resolve()
    server.close(() => resolve())
    server.closeAllConnections()
  }))
  return Promise.all(closing).then(() => undefined)
}

afterAll(async () => {
  await closeServers()
})

interface ChildResult {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

function runDownload(
  url: string,
  options: { httpProxy?: string; httpsProxy?: string; noProxy?: string; timeoutMs?: number; trustCert?: boolean } = {},
): Promise<ChildResult> {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:HTTP|HTTPS|ALL|NO)_PROXY$/i.test(key) || /^GLOBAL_AGENT_/i.test(key)) delete env[key]
  }
  delete env.NODE_TLS_REJECT_UNAUTHORIZED
  delete env.NODE_EXTRA_CA_CERTS
  env.ELECTRON_GET_NO_PROGRESS = '1'
  if (options.httpProxy !== undefined) env.HTTP_PROXY = options.httpProxy
  if (options.httpsProxy !== undefined) env.HTTPS_PROXY = options.httpsProxy
  if (options.noProxy !== undefined) env.NO_PROXY = options.noProxy

  const args = [childPath, url, options.timeoutMs ? String(options.timeoutMs) : '', options.trustCert ? certificatePath : '']
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, 12_000)
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) return reject(new Error(`@electron/get child exceeded 12 seconds\n${stdout}\n${stderr}`))
      resolve({ code, signal, stdout, stderr })
    })
  })
}

function childPayload(result: ChildResult): { getVersion: string; globalAgentVersion: string; payload: string } {
  const marker = result.stdout.split(/\r?\n/).find(line => line.startsWith('PROXY_CHILD_RESULT '))
  if (!marker) throw new Error(`Missing child success result. exit=${result.code}\n${result.stdout}\n${result.stderr}`)
  return JSON.parse(marker.slice('PROXY_CHILD_RESULT '.length)) as {
    getVersion: string
    globalAgentVersion: string
    payload: string
  }
}

function proxyUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

describe('@electron/get proxy compatibility with its app-builder-lib dependency', () => {
  it('loads @electron/get from app-builder-lib and a valid global-agent package', () => {
    expect(getVersion).toBe('3.1.0')
    expect(globalAgentVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('resolves the app-builder-lib copy and routes HTTP downloads through the configured proxy', async () => {
    const targetPort = await unusedLoopbackPort()
    const requests: string[] = []
    const proxy = trackServer(createHttpServer((request, response) => {
      requests.push(request.url ?? '')
      response.end('http through proxy')
    }))
    const port = await listen(proxy)

    const targetUrl = `http://127.0.0.1:${targetPort}/proxy-test.bin`
    const result = await runDownload(targetUrl, { httpProxy: proxyUrl(port) })

    expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0)
    expect(childPayload(result)).toEqual({
      getVersion: '3.1.0',
      globalAgentVersion,
      payload: 'http through proxy',
    })
    expect(requests).toEqual([targetUrl])
  }, 15_000)

  it('honors NO_PROXY and connects directly to a local HTTP target', async () => {
    let targetHits = 0
    const target = trackServer(createHttpServer((_request, response) => {
      targetHits++
      response.end('direct by no proxy')
    }))
    const targetPort = await listen(target)
    const proxyRequests: string[] = []
    const proxy = trackServer(createHttpServer((request, response) => {
      proxyRequests.push(request.url ?? '')
      response.end('unexpected proxy route')
    }))
    const proxyPort = await listen(proxy)

    const result = await runDownload(`http://127.0.0.1:${targetPort}/artifact.bin`, {
      httpProxy: proxyUrl(proxyPort),
      noProxy: '127.0.0.1',
    })

    expect(result.code).toBe(0)
    expect(childPayload(result).payload).toBe('direct by no proxy')
    expect(targetHits).toBe(1)
    expect(proxyRequests).toEqual([])
  }, 15_000)

  it('uses HTTPS CONNECT, verifies a local CA, and sends matching localhost SNI', async () => {
    let observedSni: string | false | undefined
    const target = trackServer(createHttpsServer({ key: testPrivateKey, cert: testCertificate }, (_request, response) => {
      response.end('https through connect')
    }))
    target.on('secureConnection', socket => { observedSni = socket.servername })
    const targetPort = await listen(target)
    const connects: string[] = []
    const proxy = trackServer(createHttpServer())
    proxy.on('connect', (request, clientSocket, head) => {
      const destination = request.url ?? ''
      connects.push(destination)
      const [, portText] = destination.split(':')
      const upstream = connectTcp(Number(portText), '127.0.0.1')
      sockets.add(upstream)
      upstream.once('close', () => sockets.delete(upstream))
      upstream.once('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        clientSocket.pipe(upstream)
        upstream.pipe(clientSocket)
      })
      upstream.once('error', error => clientSocket.destroy(error))
      clientSocket.once('close', () => upstream.destroy())
      upstream.once('close', () => clientSocket.destroy())
    })
    const proxyPort = await listen(proxy)

    const result = await runDownload(`https://localhost:${targetPort}/artifact.bin`, {
      httpsProxy: proxyUrl(proxyPort),
      trustCert: true,
    })

    expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0)
    expect(childPayload(result).payload).toBe('https through connect')
    expect(connects).toEqual([`localhost:${targetPort}`])
    expect(observedSni).toBe('localhost')
  }, 15_000)

  it('accepts the test CA on a direct HTTPS download', async () => {
    const target = trackServer(createHttpsServer({ key: testPrivateKey, cert: testCertificate }, (_request, response) => {
      response.end('https direct with CA')
    }))
    const targetPort = await listen(target)

    const result = await runDownload(`https://127.0.0.1:${targetPort}/artifact.bin`, { trustCert: true })

    expect(result.code, `${result.stderr}\n${result.stdout}`).toBe(0)
    expect(childPayload(result).payload).toBe('https direct with CA')
  }, 15_000)

  it('rejects the self-signed target certificate through HTTPS CONNECT', async () => {
    const target = trackServer(createHttpsServer({ key: testPrivateKey, cert: testCertificate }, (_request, response) => {
      response.end('must not be accepted')
    }))
    const targetPort = await listen(target)
    const connects: string[] = []
    const proxy = trackServer(createHttpServer())
    proxy.on('connect', (request, clientSocket, head) => {
      const destination = request.url ?? ''
      connects.push(destination)
      const [, portText] = destination.split(':')
      const upstream = connectTcp(Number(portText), '127.0.0.1')
      sockets.add(upstream)
      upstream.once('close', () => sockets.delete(upstream))
      upstream.once('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        clientSocket.pipe(upstream)
        upstream.pipe(clientSocket)
      })
      upstream.once('error', error => clientSocket.destroy(error))
      clientSocket.once('close', () => upstream.destroy())
      upstream.once('close', () => clientSocket.destroy())
    })
    const proxyPort = await listen(proxy)

    const result = await runDownload(`https://localhost:${targetPort}/artifact.bin`, { httpsProxy: proxyUrl(proxyPort) })

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('"code":"DEPTH_ZERO_SELF_SIGNED_CERT"')
    expect(connects).toEqual([`localhost:${targetPort}`])
  }, 15_000)

  it('surfaces a refused proxy connection instead of silently downloading directly', async () => {
    const proxyPort = await unusedLoopbackPort()
    const targetPort = await unusedLoopbackPort()

    const result = await runDownload(`http://127.0.0.1:${targetPort}/proxy-test.bin`, {
      httpProxy: proxyUrl(proxyPort),
    })

    expect(result.code).toBe(2)
    expect(result.stderr).toContain('"code":"ECONNREFUSED"')
    expect(result.stderr).toContain(`127.0.0.1:${proxyPort}`)
  }, 15_000)

  it('honors Got request timeout for an unresponsive HTTP proxy', async () => {
    let received = 0
    const proxy = trackServer(createHttpServer(() => { received++ }))
    const port = await listen(proxy)

    const targetPort = await unusedLoopbackPort()
    const result = await runDownload(`http://127.0.0.1:${targetPort}/slow.bin`, {
      httpProxy: proxyUrl(port),
      timeoutMs: 350,
    })

    expect(received).toBe(1)
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/Timeout|ETIMEDOUT/i)
  }, 15_000)
})
