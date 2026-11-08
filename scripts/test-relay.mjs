/**
 * Unit test for the same-origin JSON-RPC relay (api/rpc.js).
 * Runs the real handler with a fake req/res and a mocked global fetch.
 *
 *   npm run test:relay
 */
import handler from '../api/rpc.js'
import { RPC_UPSTREAMS } from '../shared/rpc-upstreams.js'

const failures = []
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function makeRes() {
  const headers = {}
  const state = { statusCode: 200, body: undefined }
  const res = {
    setHeader(key, value) {
      headers[key.toLowerCase()] = value
    },
    status(code) {
      state.statusCode = code
      return res
    },
    json(payload) {
      state.body = payload
      return res
    },
    send(text) {
      state.body = text
      return res
    },
    end(text) {
      if (text !== undefined) state.body = text
      return res
    },
  }
  return { res, state, headers }
}

const realFetch = globalThis.fetch

/** scenario: url -> 'ok' | 'http500' | 'network-error' */
function installFetch(scenario) {
  globalThis.fetch = async (url) => {
    const mode = scenario[url] ?? 'network-error'
    if (mode === 'network-error') throw new TypeError('Failed to fetch')
    if (mode === 'http500') return new Response('oops', { status: 500 })
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }
}

console.log('\nRPC relay test\n')

/* 1. happy path with failover */
installFetch({
  [RPC_UPSTREAMS.ethereum[0]]: 'network-error',
  [RPC_UPSTREAMS.ethereum[1]]: 'ok',
})
{
  const { res, state, headers } = makeRes()
  await handler(
    { method: 'POST', query: { network: 'ethereum' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' },
    res,
  )
  check('post returns 200', state.statusCode === 200, String(state.statusCode))
  check('payload passed through', String(state.body).includes('"0x1"'))
  check(
    'failover reached the second endpoint',
    headers['x-watchvault-upstream'] === RPC_UPSTREAMS.ethereum[1],
    headers['x-watchvault-upstream'],
  )
  check('no-store set', headers['cache-control'] === 'no-store')
}

/* 2. all upstreams down */
installFetch(Object.fromEntries(RPC_UPSTREAMS.ethereum.map((url) => [url, 'http500'])))
{
  const { res, state } = makeRes()
  await handler({ method: 'POST', query: { network: 'ethereum' }, body: '{}' }, res)
  check('all-down returns 502', state.statusCode === 502, String(state.statusCode))
  check('failure lists attempts', Array.isArray(state.body?.tried) && state.body.tried.length === RPC_UPSTREAMS.ethereum.length)
}

/* 3. validation */
{
  const { res, state } = makeRes()
  await handler({ method: 'POST', query: { network: 'dogecoin' }, body: '{}' }, res)
  check('unknown network returns 400', state.statusCode === 400, String(state.statusCode))
}
{
  const { res, state } = makeRes()
  await handler({ method: 'PUT', query: { network: 'ethereum' }, body: '{}' }, res)
  check('unsupported method returns 405', state.statusCode === 405, String(state.statusCode))
}
{
  const { res, state } = makeRes()
  await handler({ method: 'OPTIONS', query: { network: 'ethereum' } }, res)
  check('preflight returns 204', state.statusCode === 204, String(state.statusCode))
}

/* 4. health probe */
installFetch({ [RPC_UPSTREAMS.sepolia[0]]: 'ok' })
{
  const { res, state } = makeRes()
  await handler({ method: 'GET', query: { network: 'sepolia' } }, res)
  check('probe returns 200', state.statusCode === 200)
  check(
    'probe reports every endpoint',
    Array.isArray(state.body?.results) && state.body.results.length === RPC_UPSTREAMS.sepolia.length,
  )
  check('probe marks the live one', state.body?.results?.filter((item) => item.ok).length === 1)
}

/* 5. every network has endpoints */
check(
  'all networks configured',
  Object.values(RPC_UPSTREAMS).every((urls) => Array.isArray(urls) && urls.length >= 3),
)
check(
  'no dead providers left in the list',
  !JSON.stringify(RPC_UPSTREAMS).match(/ankr|llamarpc|cloudflare-eth|blastapi|polygon-rpc\.com/),
)

globalThis.fetch = realFetch

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`)
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('All relay checks passed.\n')
