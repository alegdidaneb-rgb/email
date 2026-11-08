import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { RPC_UPSTREAMS } from './shared/rpc-upstreams.js'
import type { NetworkId } from './src/lib/types'

const TIMEOUT_MS = 8_000

async function callUpstream(url: string, body: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body,
      signal: controller.signal,
    })
    return { ok: response.ok, status: response.status, text: await response.text() }
  } finally {
    clearTimeout(timer)
  }
}

async function probe(url: string, body: string) {
  const started = Date.now()
  try {
    const outcome = await callUpstream(url, body)
    return { url, ok: outcome.ok, status: outcome.status, ms: Date.now() - started }
  } catch (error) {
    return { url, ok: false, status: 0, ms: Date.now() - started, error: String(error) }
  }
}

/**
 * Mirrors the production `/api/rpc` serverless function so `npm run dev` behaves
 * exactly like the deployed app, including the same-origin relay fallback.
 */
function rpcProxyPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '', 'http://localhost')
    const network = (url.searchParams.get('network') ?? 'ethereum') as NetworkId
    const upstreams = RPC_UPSTREAMS[network]

    res.setHeader('cache-control', 'no-store')
    res.setHeader('access-control-allow-origin', '*')

    if (!upstreams) {
      res.statusCode = 400
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: `Unknown network: ${network}` }))
      return
    }

    const probeBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })

    if (req.method === 'GET') {
      void Promise.all(upstreams.map((target) => probe(target, probeBody))).then((results) => {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ network, results }))
      })
      return
    }

    let body = ''
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      void (async () => {
        for (const target of upstreams) {
          try {
            const outcome = await callUpstream(target, body)
            if (!outcome.ok) continue
            res.statusCode = 200
            res.setHeader('content-type', 'application/json')
            res.setHeader('x-watchvault-upstream', target)
            res.end(outcome.text)
            return
          } catch {
            /* try the next upstream */
          }
        }
        res.statusCode = 502
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ error: 'All upstream RPC endpoints failed', network }))
      })()
    })
  }

  return {
    name: 'watchvault-rpc-proxy',
    configureServer(server) {
      server.middlewares.use('/api/rpc', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/rpc', handler)
    },
  }
}

export default defineConfig({
  plugins: [react(), rpcProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
})
