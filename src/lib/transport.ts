import { custom, type Transport } from 'viem'
import { NETWORKS } from './networks'
import { proxyUrl } from './rpcUpstreams'
import type { NetworkId } from './types'

const REQUEST_TIMEOUT_MS = 5_000

export interface RpcAttempt {
  url: string
  ok: boolean
  ms: number
  error?: string
}

export interface RpcReport {
  network: NetworkId
  at: number
  via: string | null
  attempts: RpcAttempt[]
}

const reports = new Map<NetworkId, RpcReport>()

/** Latest per-network read outcome, for the UI. */
export function getRpcReports(): RpcReport[] {
  return [...reports.values()]
}

export function rpcLabel(url: string): string {
  if (url.startsWith('/')) return 'built-in relay'
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

let nextId = 1

async function callOne(
  url: string,
  body: string,
  started: number,
): Promise<RpcAttempt & { result?: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const elapsed = () => Math.round(performance.now() - started)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) return { url, ok: false, ms: elapsed(), error: `HTTP ${response.status}` }
    let parsed: { result?: unknown; error?: { message?: string } }
    try {
      parsed = JSON.parse(text)
    } catch {
      return { url, ok: false, ms: elapsed(), error: 'unreadable response' }
    }
    if (parsed.error) {
      return { url, ok: false, ms: elapsed(), error: parsed.error.message ?? 'RPC error' }
    }
    return { url, ok: true, ms: elapsed(), result: parsed.result }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'timed out'
          : error.message
        : 'request failed'
    return { url, ok: false, ms: elapsed(), error: message }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * JSON-RPC transport that asks every candidate at once — the direct endpoints and
 * the same-origin relay — and takes whichever answers first. A blocked, throttled
 * or CORS-hostile provider can no longer hold a balance read hostage, and the
 * attempts are recorded so the UI can explain a failure instead of showing "—".
 */
export function createTransport(network: NetworkId, customRpcUrl: string): Transport {
  return custom(
    {
      async request({ method, params }) {
      const config = NETWORKS[network] ?? NETWORKS.ethereum
      const custom = customRpcUrl.trim()
      const candidates = custom ? [custom] : [...config.rpcUrls, proxyUrl(network)]
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: nextId++,
        method,
        params: params ?? [],
      })
      const started = performance.now()
      const attempts: RpcAttempt[] = []

      const tasks = candidates.map(async (url) => {
        const attempt = await callOne(url, body, started)
        attempts.push(attempt)
        if (!attempt.ok) throw new Error(`${rpcLabel(url)}: ${attempt.error}`)
        return { url, result: attempt.result }
      })

      try {
        const winner = await Promise.any(tasks)
        reports.set(network, {
          network,
          at: Date.now(),
          via: winner.url,
          attempts: [...attempts].sort((a, b) => a.ms - b.ms),
        })
        return winner.result
      } catch {
        const summary = attempts
          .map((attempt) => `${rpcLabel(attempt.url)} (${attempt.error})`)
          .join(', ')
        reports.set(network, {
          network,
          at: Date.now(),
          via: null,
          attempts: [...attempts].sort((a, b) => a.ms - b.ms),
        })
        throw new Error(
          `No RPC endpoint answered for ${config.name}. Tried ${attempts.length}: ${summary}`,
        )
      }
      },
    },
    { retryCount: 0, name: `watchvault-${network}` },
  )
}
