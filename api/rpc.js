/**
 * Same-origin JSON-RPC relay (Vercel serverless function).
 *
 * The browser calls POST /api/rpc?network=ethereum and this forwards the payload
 * to the first upstream that answers. Because the request is same-origin, CORS
 * can never break balance reads — which is the failure mode that kills most
 * "read the chain from the browser" apps.
 *
 * GET /api/rpc?network=...&probe=1 returns the upstream status list, which the
 * in-app connection test uses.
 */
import { RPC_UPSTREAMS } from '../shared/rpc-upstreams.js'

const TIMEOUT_MS = 8000

async function callUpstream(url, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body,
      signal: controller.signal,
    })
    const text = await response.text()
    return { ok: response.ok, status: response.status, text }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS')
  res.setHeader('cache-control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const network = String(req.query?.network ?? 'ethereum')
  const urls = RPC_UPSTREAMS[network]
  if (!urls || urls.length === 0) {
    res.status(400).json({ error: `Unknown network: ${network}` })
    return
  }

  // Health probe: report which upstreams answer right now.
  if (req.method === 'GET') {
    const probeBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
    })
    const results = await Promise.all(
      urls.map(async (url) => {
        const started = Date.now()
        try {
          const outcome = await callUpstream(url, probeBody)
          return { url, ok: outcome.ok, status: outcome.status, ms: Date.now() - started }
        } catch (error) {
          return { url, ok: false, status: 0, ms: Date.now() - started, error: String(error) }
        }
      }),
    )
    res.status(200).json({ network, results })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST for JSON-RPC, GET for a health probe' })
    return
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {})
  const errors = []

  for (const url of urls) {
    try {
      const outcome = await callUpstream(url, body)
      if (!outcome.ok) {
        errors.push(`${url} -> HTTP ${outcome.status}`)
        continue
      }
      res.setHeader('content-type', 'application/json')
      res.setHeader('x-watchvault-upstream', url)
      res.status(200).send(outcome.text)
      return
    } catch (error) {
      errors.push(`${url} -> ${String(error)}`)
    }
  }

  res.status(502).json({
    error: 'All upstream RPC endpoints failed',
    network,
    tried: errors,
  })
}
