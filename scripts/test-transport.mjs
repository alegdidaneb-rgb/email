/**
 * Unit test for the racing JSON-RPC transport: first success wins, failures are
 * reported per endpoint, custom endpoints are honoured exclusively.
 *
 *   npm run test:transport
 */
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await esbuild.build({
  entryPoints: [resolve(root, 'src/lib/transport.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: resolve(root, 'node_modules/.smoke/transport.mjs'),
  logLevel: 'error',
})

const { createTransport, getRpcReports, rpcLabel } = await import(
  resolve(root, 'node_modules/.smoke/transport.mjs')
)

const failures = []
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const realFetch = globalThis.fetch
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ok(value) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: value }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const params = { method: 'eth_getBalance', params: ['0xabc', 'latest'] }
// A viem Transport is a factory: call it to get the request function.
const request = (transport) => transport({}).request
console.log('\nTransport test\n')

/* 1. fastest healthy endpoint wins */
{
  let calls = 0
  globalThis.fetch = async (url) => {
    calls += 1
    if (String(url).includes('drpc')) return ok('0x1')          // fast + healthy
    if (String(url).includes('publicnode')) {                    // slow + broken
      await sleep(120)
      throw new TypeError('Failed to fetch')
    }
    throw new TypeError('blocked')
  }
  const transport = createTransport('ethereum', '')
  const result = await request(transport)(params)
  check('returns the first successful result', result === '0x1', String(result))
  check('queries multiple candidates in parallel', calls >= 2, `calls=${calls}`)
  const report = getRpcReports().find((item) => item.network === 'ethereum')
  check('report records the winning endpoint', report?.via?.includes('drpc'), String(report?.via))
  await sleep(150)
}

/* 2. every endpoint down -> informative error + full attempt list */
{
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch')
  }
  const transport = createTransport('ethereum', '')
  let message = ''
  try {
    await request(transport)(params)
  } catch (error) {
    message = String(error.message)
  }
  check('throws an explanatory error', message.includes('No RPC endpoint answered'), message)
  check('error names the network', message.includes('Ethereum'))
  const report = getRpcReports().find((item) => item.network === 'ethereum')
  check('report marks the network as down', report?.via === null)
  check(
    'report lists every attempt',
    (report?.attempts.length ?? 0) >= 5,
    `attempts=${report?.attempts.length}`,
  )
  check(
    'relay was included in the attempts',
    report?.attempts.some((attempt) => attempt.url.startsWith('/api/rpc')),
  )
}

/* 3. a custom endpoint is used exclusively */
{
  const seen = []
  globalThis.fetch = async (url) => {
    seen.push(String(url))
    return ok('0xbeef')
  }
  const transport = createTransport('sepolia', 'http://127.0.0.1:8545')
  const result = await request(transport)(params)
  check('custom endpoint result returned', result === '0xbeef', String(result))
  check('only the custom endpoint was called', seen.length === 1 && seen[0].includes('127.0.0.1'), seen.join(','))
}

/* 4. HTTP + RPC errors are distinguished */
{
  globalThis.fetch = async (url) => {
    if (String(url).includes('publicnode')) return new Response('nope', { status: 526 })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'rate limited' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const transport = createTransport('base', '')
  let message = ''
  try {
    await request(transport)(params)
  } catch (error) {
    message = String(error.message)
  }
  check('http status surfaces', message.includes('HTTP 526'), message)
  check('rpc error message surfaces', message.includes('rate limited'), message)
}

/* 5. labels */
check('relay label is friendly', rpcLabel('/api/rpc?network=ethereum') === 'built-in relay')
check('host label strips scheme', rpcLabel('https://eth.drpc.org') === 'eth.drpc.org')

globalThis.fetch = realFetch

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`)
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('All transport checks passed.\n')
