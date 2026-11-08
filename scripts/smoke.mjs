/**
 * Headless smoke test: renders the real App in jsdom against a mocked JSON-RPC
 * endpoint and walks the main flows (add wallet -> read balance -> drift alert).
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
globalThis.Event = window.Event
globalThis.KeyboardEvent = window.KeyboardEvent
globalThis.localStorage = window.localStorage
globalThis.Notification = undefined
globalThis.IS_REACT_ACT_ENVIRONMENT = false

Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
})

/* ---- mocked Ethereum RPC ------------------------------------------------ */

let balanceWei = 1_000_000_000_000_000_000n // 1 ETH
const rpcCalls = []

function answer(call) {
  rpcCalls.push(call.method)
  switch (call.method) {
    case 'eth_chainId':
      return '0x1'
    case 'eth_getBalance':
      return `0x${balanceWei.toString(16)}`
    case 'eth_blockNumber':
      return '0x1400000'
    default:
      return null
  }
}

globalThis.fetch = async (_url, init) => {
  const payload = JSON.parse(init.body)
  const handle = (call) => ({
    jsonrpc: '2.0',
    id: call.id ?? 1,
    result: answer(call),
  })
  const body = Array.isArray(payload) ? payload.map(handle) : handle(payload)
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/* ---- seed settings so the app uses the mock endpoint --------------------- */

window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
window.localStorage.setItem(
  'watchvault.db.v1',
  JSON.stringify({
    version: 1,
    wallets: [],
    settings: {
      rpcUrl: 'http://127.0.0.1:8545',
      toleranceEth: '0.0005',
      autoRefreshSeconds: 0,
      notifications: false,
    },
    alerts: [],
  }),
)

/* ---- bundle + boot the app ---------------------------------------------- */

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
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => window.document.body.textContent ?? ''

function setInput(el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

function findInput(placeholder) {
  return [...window.document.querySelectorAll('input')].find(
    (el) => el.placeholder === placeholder,
  )
}

console.log('\nWatchVault smoke test\n')

await import(resolve(root, 'node_modules/.smoke/app.mjs'))
await sleep(300)

/* empty state */
check('renders empty state', text().includes('Add your first watch-only wallet'))
check('renders wallet count 0', text().includes('Wallets watched'))

/* add a wallet through the form */
const addressInput = findInput('0x…')
check('address field present', Boolean(addressInput))
const labelInput = findInput('Ledger cold storage')
const amountInput = findInput('1.5')
const noteInput = findInput('Seed phrase in the safe deposit box')

setInput(addressInput, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
setInput(labelInput, 'Cold storage')
setInput(amountInput, '1')
setInput(noteInput, 'Safe deposit box')

window.document.querySelector('form button[type="submit"]').click()
await sleep(500)

check('wallet card added', text().includes('Cold storage'))
check('balance read over RPC', rpcCalls.includes('eth_getBalance'))
check('balance rendered', /1\s*ETH/.test(text()), text().slice(0, 120))
check('status matches', text().includes('Matches') || text().includes('Within'))
check('note rendered', text().includes('Safe deposit box'))
check('persisted to localStorage', (window.localStorage.getItem('watchvault.db.v1') ?? '').includes('Cold storage'))

/* reject a bad address */
setInput(findInput('0x…'), '0x1234')
setInput(findInput('1.5'), '2')
window.document.querySelector('form button[type="submit"]').click()
await sleep(120)
check('invalid address rejected', text().includes('40 hex characters'))
check('bad wallet not added', (text().match(/Cold storage/g) ?? []).length === 1)

/* drift: funds leave the wallet */
balanceWei = 400_000_000_000_000_000n // 0.4 ETH
const checkNow = [...window.document.querySelectorAll('button')].find((b) =>
  b.textContent?.includes('Check now'),
)
checkNow.click()
await sleep(500)

check('status flips to below', text().includes('Below assigned'))
check('shortfall shown', text().includes('Short by'))
check('alert logged', text().includes('funds moved out'))
check('history recorded', (window.localStorage.getItem('watchvault.db.v1') ?? '').includes('"history":[{"t"'))

/* reconcile button */
const reconcile = [...window.document.querySelectorAll('button')].find((b) =>
  b.textContent?.includes('Assign current amount'),
)
check('reconcile action offered', Boolean(reconcile))
reconcile?.click()
await sleep(300)
check('assigning current amount clears drift', text().includes('Within'))

/* remove */
window.confirm = () => true
const remove = [...window.document.querySelectorAll('button')].find((b) =>
  b.textContent?.includes('Remove'),
)
remove?.click()
await sleep(200)
check('wallet removed', text().includes('Add your first watch-only wallet'))

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`)
  failures.forEach((f) => console.error(` - ${f}`))
  process.exit(1)
}
console.log('All smoke checks passed.\n')
process.exit(0)
