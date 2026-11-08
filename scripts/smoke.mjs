/**
 * Headless smoke test: renders the real App in jsdom against a mocked JSON-RPC
 * endpoint and walks the main flows — v1 migration, multi-network wallets,
 * ERC-20 tracking, drift detection and reconcile.
 *
 *   npm run smoke
 */
import { JSDOM } from 'jsdom'
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
})

const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.HTMLElement = window.HTMLElement
globalThis.HTMLInputElement = window.HTMLInputElement
globalThis.HTMLSelectElement = window.HTMLSelectElement
globalThis.Event = window.Event
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.localStorage = window.localStorage
globalThis.Notification = undefined

Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })

/* ---- mocked Ethereum RPC ------------------------------------------------ */

let nativeWei = 1_000_000_000_000_000_000n // 1 native unit
let tokenRaw = 1_200_000_000n // 1,200.000000 USDC (6 decimals)

const TOKEN_SYMBOL_SELECTOR = '0x95d89b41'
const TOKEN_DECIMALS_SELECTOR = '0x313ce567'
const TOKEN_BALANCE_SELECTOR = '0x70a08231'

const word = (hex) => hex.padStart(64, '0')

function encodeString(value) {
  const hex = Buffer.from(value, 'utf8').toString('hex')
  return `0x${word('20')}${word((hex.length / 2).toString(16))}${hex.padEnd(64, '0')}`
}

const rpcCalls = []

function answer(call) {
  rpcCalls.push(call.method)
  switch (call.method) {
    case 'eth_chainId':
      return '0x1'
    case 'eth_getBalance':
      return `0x${nativeWei.toString(16)}`
    case 'eth_blockNumber':
      return '0x1400000'
    case 'eth_call': {
      const data = String(call.params?.[0]?.data ?? '')
      if (data.startsWith(TOKEN_DECIMALS_SELECTOR)) return `0x${word('6')}`
      if (data.startsWith(TOKEN_SYMBOL_SELECTOR)) return encodeString('USDC')
      if (data.startsWith(TOKEN_BALANCE_SELECTOR)) return `0x${word(tokenRaw.toString(16))}`
      return `0x${word('0')}`
    }
    default:
      return null
  }
}

let relayCalls = 0
let blockAll = false

function rpcResponse(init) {
  const payload = JSON.parse(init.body)
  const handle = (call) => ({ jsonrpc: '2.0', id: call.id ?? 1, result: answer(call) })
  const body = Array.isArray(payload) ? payload.map(handle) : handle(payload)
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// Simulates a strict browser: every public RPC host is blocked (CORS/firewall),
// so only the locally configured endpoint and the same-origin relay can answer.
globalThis.fetch = async (url, init) => {
  if (blockAll) throw new TypeError('Failed to fetch')
  const target = String(url)
  if (target.startsWith('/api/rpc')) {
    relayCalls += 1
    return rpcResponse(init)
  }
  if (target.startsWith('http://127.0.0.1')) return rpcResponse(init)
  throw new TypeError('Failed to fetch')
}

/* ---- seed a v1 database to exercise the migration ----------------------- */

window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)

const RPC = 'http://127.0.0.1:8545'
const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

window.localStorage.setItem(
  'watchvault.db.v1',
  JSON.stringify({
    version: 1,
    wallets: [
      {
        id: 'legacy-1',
        address: ADDRESS,
        label: 'Cold storage',
        expectedEth: '1',
        note: 'Safe deposit box',
        createdAt: 1,
        lastEth: null,
        lastCheckedAt: null,
        status: 'unknown',
        history: [],
      },
    ],
    settings: { rpcUrl: RPC, toleranceEth: '0.0005', autoRefreshSeconds: 0, notifications: false },
    alerts: [],
  }),
)

/* ---- bundle + boot ------------------------------------------------------ */

await esbuild.build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
  outfile: resolve(root, 'node_modules/.smoke/app.mjs'),
  logLevel: 'error',
})

const failures = []
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => window.document.body.textContent ?? ''
const cards = () => [...window.document.querySelectorAll('.wallet-card')]
const cardFor = (label) => cards().find((card) => card.textContent?.includes(label))

function setValue(el, value) {
  const proto =
    el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
}

function inputBy(rootEl, placeholder) {
  return [...rootEl.querySelectorAll('input, select')].find(
    (el) => el.placeholder === placeholder || el.getAttribute('aria-label') === placeholder,
  )
}

function clickButton(rootEl, label) {
  const button = [...rootEl.querySelectorAll('button')].find((el) =>
    el.textContent?.includes(label),
  )
  button?.click()
  return Boolean(button)
}

console.log('\nWatchVault smoke test\n')

await import(resolve(root, 'node_modules/.smoke/app.mjs'))
await sleep(400)

/* v1 -> v2 migration + first read */
const stored = JSON.parse(window.localStorage.getItem('watchvault.db.v1') ?? '{}')
check('legacy wallet rendered', text().includes('Cold storage'))
check('migrated to v2', stored.version === 2, `version=${stored.version}`)
check('legacy amount migrated', stored.wallets?.[0]?.expectedNative === '1')
check('legacy wallet defaulted to Ethereum', stored.wallets?.[0]?.network === 'ethereum')
check('legacy RPC carried into customRpcs', stored.settings?.customRpcs?.ethereum === RPC)
check('native balance read', rpcCalls.includes('eth_getBalance'))
check('legacy wallet matches assigned', cardFor('Cold storage')?.textContent?.includes('Matches'))
check('network badge shown', text().includes('Ethereum'))

/* network-aware duplicate protection */
const form = window.document.querySelector('form.form-card')
setValue(inputBy(form, '0x…'), ADDRESS)
inputBy(form, 'Ledger cold storage') // label stays empty -> default
setValue(inputBy(form, '1.5'), '1')
form.querySelector('button[type="submit"]').click()
await sleep(300)
check('duplicate on same network rejected', text().includes('already watched on Ethereum'))

/* same address on another network is a different watch item */
setValue(form.querySelector('select'), 'base')
setValue(inputBy(form, '0x…'), ADDRESS)
setValue(inputBy(form, 'Ledger cold storage'), 'Base treasury')
setValue(inputBy(form, '1.5'), '1')
form.querySelector('button[type="submit"]').click()
await sleep(500)

const baseCard = cardFor('Base treasury')
check('wallet added on Base', Boolean(baseCard))
check('Base badge rendered', baseCard?.textContent?.includes('Base'))
check('base native balance read', baseCard?.textContent?.includes('Matches'))
check('native symbol follows network', baseCard?.textContent?.includes('ETH'))
check(
  'falls back to the same-origin relay when direct endpoints are blocked',
  relayCalls > 0,
  `relayCalls=${relayCalls}`,
)

/* ERC-20 tracking */
clickButton(baseCard, 'Track ERC-20 token')
await sleep(80)
setValue(inputBy(baseCard, 'Token contract 0x…'), TOKEN)
setValue(inputBy(baseCard, 'Assigned amount'), '1200')
baseCard.querySelector('form.token-form button[type="submit"]').click()
await sleep(700)

check('token symbol detected', baseCard.textContent?.includes('USDC'))
check('token balance read', baseCard.textContent?.includes('1,200'))
check('token assigned shown', baseCard.textContent?.includes('assigned 1,200'))
check('token in line', baseCard.textContent?.includes('in line'))
check(
  'token persisted',
  (window.localStorage.getItem('watchvault.db.v1') ?? '').includes('"symbol":"USDC"'),
)

/* token drift */
tokenRaw = 900_000_000n // 900 USDC
clickButton(window.document, 'Check now')
await sleep(700)

check('token drift flagged', baseCard.textContent?.includes('short by 300'))
check('token drift alert logged', text().includes('USDC under the assigned amount'))
check('card turns red on token drift', baseCard.className.includes('is-below'), baseCard.className)

/* reconcile token */
clickButton(baseCard, 'reconcile')
await sleep(400)
check('token reconcile clears drift', baseCard.textContent?.includes('in line'))

/* remove token */
const tokenRow = baseCard.querySelector('.token-row')
tokenRow?.querySelectorAll('button')[1]?.click()
await sleep(250)
check('token removed', !baseCard.textContent?.includes('USDC'))

/* network filter appears once multiple networks are watched */
const networkSelect = window.document.querySelector('.network-filter select')
check('network filter shown', Boolean(networkSelect))
if (networkSelect) {
  setValue(networkSelect, 'base')
  await sleep(250)
  check('network filter narrows list', cards().length === 1 && Boolean(cardFor('Base treasury')))
  setValue(networkSelect, 'all')
  await sleep(200)
}

/* testnet support */
setValue(form.querySelector('select'), 'sepolia')
await sleep(120)
check('faucet hint shown for testnet', text().includes('faucet'))
setValue(inputBy(form, '0x…'), ADDRESS)
setValue(inputBy(form, 'Ledger cold storage'), 'Sepolia test')
setValue(inputBy(form, '1.5'), '1')
form.querySelector('button[type="submit"]').click()
await sleep(600)

const sepoliaCard = cardFor('Sepolia test')
check('testnet wallet added', Boolean(sepoliaCard))
check('testnet chip rendered', sepoliaCard?.textContent?.includes('testnet'))
check('sepolia network named', sepoliaCard?.textContent?.includes('Sepolia'))
check('sepolia balance read', sepoliaCard?.textContent?.includes('Matches'))
check(
  'testnet persisted',
  (window.localStorage.getItem('watchvault.db.v1') ?? '').includes('"network":"sepolia"'),
)

/* native drift + reconcile + remove */
nativeWei = 400_000_000_000_000_000n
clickButton(window.document, 'Check now')
await sleep(600)
check('native drift flagged', cardFor('Base treasury')?.textContent?.includes('Below assigned'))
check('shortfall shown', cardFor('Base treasury')?.textContent?.includes('Short by'))

clickButton(cardFor('Base treasury'), 'Assign current amount')
await sleep(400)
check('native reconcile clears drift', cardFor('Base treasury')?.textContent?.includes('Within'))

/* total outage: nothing answers, anywhere */
blockAll = true
clickButton(window.document, 'Check now')
await sleep(2600)

check('outage is explained in the banner', text().includes('No RPC endpoint answered'))
check(
  'failed read is flagged on the card',
  text().includes("Couldn't reach an RPC endpoint"),
)
clickButton(window.document, 'Details')
await sleep(150)
check('diagnostics name the attempted endpoints', text().includes('built-in relay'))

let copiedReport = ''
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: async (value) => {
      copiedReport = value
    },
  },
})
clickButton(window.document, 'Copy report')
await sleep(150)
check('copy report fills the clipboard', copiedReport.includes('RPC report'))
check('copied report names the relay', copiedReport.includes('built-in relay'))
check('copied report keeps the failure reason', /fail .+·|fail /.test(copiedReport))
check('copy button confirms', text().includes('Copied'))

/* recovery */
blockAll = false
clickButton(window.document, 'Check now')
await sleep(1400)
check('recovers once an endpoint answers again', !text().includes('No RPC endpoint answered'))
check('card failure flag cleared', !text().includes("Couldn't reach an RPC endpoint"))

window.confirm = () => true
clickButton(cardFor('Base treasury'), 'Remove')
await sleep(300)
check('wallet removed', !cardFor('Base treasury'))

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`)
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('All smoke checks passed.\n')
process.exit(0)
