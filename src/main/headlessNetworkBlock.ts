interface BeforeRequestDetails { url: string }
interface BeforeRequestResult { cancel?: boolean }
type BeforeRequestListener = (
  details: BeforeRequestDetails,
  callback: (result: BeforeRequestResult) => void,
) => void

export interface NetworkRequestPort {
  onBeforeRequest(listener: BeforeRequestListener): void
}

export function installHeadlessNetworkBlock(
  env: Readonly<Record<string, string | undefined>>,
  requests: NetworkRequestPort,
  attempts: string[],
): boolean {
  if (env.NC_HEADLESS !== '1' || env.NC_TEST_BLOCK_NETWORK !== '1') return false
  requests.onBeforeRequest((details, callback) => {
    if (/^https?:/i.test(details.url)) {
      attempts.push(details.url)
      callback({ cancel: true })
    } else {
      callback({})
    }
  })
  return true
}
