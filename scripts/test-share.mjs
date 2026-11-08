/**
 * Unit test for cross-device share links: encode/decode round-trip, rejection of
 * malformed payloads, duplicate skipping, and the Trust Wallet instructions.
 *
 *   npm run test:share
 */
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await esbuild.build({
  entryPoints: [resolve(root, 'src/lib/share.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: resolve(root, 'node_modules/.smoke/share.mjs'),
  logLevel: 'error',
})

const {
  SHARE_PREFIX,
  decodeShare,
  encodeShare,
  mergeShared,
  readShare,
  shareLink,
  toSharedWallet,
  trustWalletSteps,
} = await import(resolve(root, 'node_modules/.smoke/share.mjs'))

const failures = []
function check(name, condition, detail = '') {
  if (condition) console.log(`  ✓ ${name}`)
  else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const ADDRESS_A = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const ADDRESS_B = '0x1111111111111111111111111111111111111111'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const wallet = {
  id: 'w1',
  address: ADDRESS_A,
  network: 'base',
  label: '  Base treasury  ',
  note: 'internal note that must not travel',
  createdAt: 1,
  expectedNative: '1.5',
  lastNative: '1.25',
  lastCheckedAt: 2,
  status: 'below',
  history: [{ t: 1, amount: '1.25' }],
  tokens: [
    {
      id: 't1',
      tokenAddress: USDC,
      symbol: 'USDC',
      decimals: 6,
      expectedAmount: '250.5',
      lastAmount: '250.5',
      lastCheckedAt: 2,
      status: 'match',
    },
  ],
}

/* ---------- round trip ---------- */
const encoded = encodeShare([wallet], 1700000000000)
check('payload carries its prefix', encoded.startsWith(SHARE_PREFIX))
check('payload is url-safe', /^wv1\.[A-Za-z0-9_-]+$/.test(encoded))

const decoded = decodeShare(encoded)
check('round-trip decodes', decoded !== null)
check('address survives', decoded?.wallets[0]?.address === ADDRESS_A)
check('network survives', decoded?.wallets[0]?.network === 'base')
check('label is trimmed', decoded?.wallets[0]?.label === 'Base treasury')
check('assigned amount survives', decoded?.wallets[0]?.expectedNative === '1.5')
check('token survives', decoded?.wallets[0]?.tokens[0]?.address === USDC)
check('token symbol survives', decoded?.wallets[0]?.tokens[0]?.symbol === 'USDC')
check('token decimals survive', decoded?.wallets[0]?.tokens[0]?.decimals === 6)
check('token amount survives', decoded?.wallets[0]?.tokens[0]?.expectedAmount === '250.5')
check('timestamp survives', decoded?.sharedAt === 1700000000000)

/* ---------- what must never travel ---------- */
const shared = toSharedWallet(wallet)
check('notes are not shared', !('note' in shared))
check('balance snapshots are not shared', !('history' in shared))
check('ids are not shared', !('id' in shared))
check(
  'encoded payload holds no key material',
  !/privateKey|secret|mnemonic|seed/i.test(Buffer.from(encoded.slice(4), 'base64url').toString()),
)

/* ---------- rejects garbage instead of importing it ---------- */
check('rejects plain text', decodeShare('hello') === null)
check('rejects empty', decodeShare('') === null)
check('rejects valid base64 of junk', decodeShare(`wv1.${Buffer.from('12').toString('base64url')}`) === null)
check(
  'rejects an empty wallet list',
  decodeShare(`wv1.${Buffer.from(JSON.stringify({ version: 1, wallets: [] })).toString('base64url')}`) ===
    null,
)

/* ---------- sanitising hostile input ---------- */
const hostile = {
  version: 1,
  sharedAt: 5,
  wallets: [
    { address: '0xnothex', network: 'base', label: 'x', expectedNative: '1' },
    { address: ADDRESS_A, network: 'dogecoin', label: 'x', expectedNative: '1' },
    { address: ADDRESS_B, network: 'ethereum', label: 'y', expectedNative: '-5' },
    {
      address: ADDRESS_A,
      network: 'optimism',
      label: '',
      expectedNative: '0.25',
      tokens: [{ address: '0xbad', symbol: 'X', decimals: 2 }],
    },
  ],
}
const hostileDecoded = decodeShare(`wv1.${Buffer.from(JSON.stringify(hostile)).toString('base64url')}`)
check('bad addresses and networks are dropped', hostileDecoded?.wallets.length === 2)
check('negative amounts become 0', hostileDecoded?.wallets[0]?.expectedNative === '0')
check(
  'empty labels fall back to the address',
  (hostileDecoded?.wallets[1]?.label ?? '').startsWith('0xd8dA'),
)
check('invalid tokens are dropped', hostileDecoded?.wallets[1]?.tokens.length === 0)

/* ---------- links ---------- */
const link = shareLink([wallet], 'https://example.test/app')
check('link points at the app', link.startsWith('https://example.test/app#i=wv1.'))
check('link carries exactly one hash', link.split('#').length === 2)
check('existing query/hash in base is dropped', shareLink([wallet], 'https://x.dev/?a=1#old').includes('/?a=1#i=wv1.') === false)
check('link round-trips', decodeShare(readArg(link))?.wallets[0]?.address === ADDRESS_A)
check('readShare parses a hash', readShare(`#i=${encoded}`)?.wallets.length === 1)
check('readShare parses a query', readShare(`?i=${encoded}`)?.wallets.length === 1)
check('readShare accepts a bare payload', readShare(encoded)?.wallets.length === 1)
check('readShare ignores unrelated hashes', readShare('#something-else') === null)

function readArg(value) {
  const match = value.match(/#i=(wv1\.[A-Za-z0-9_-]+)/)
  return match ? match[1] : ''
}

/* ---------- merging ---------- */
const existing = [{ ...wallet, id: 'w1' }]
const incoming = [
  { address: ADDRESS_A.toLowerCase(), network: 'base', label: 'dup', expectedNative: '1', tokens: [] },
  { address: ADDRESS_B, network: 'base', label: 'new', expectedNative: '2', tokens: [] },
]
const merged = mergeShared(existing, incoming)
check('duplicates are skipped case-insensitively', merged.skipped.length === 1)
check('new wallets are added', merged.add.length === 1 && merged.add[0].address === ADDRESS_B)
check('same address on another network is new', mergeShared(existing, [
  { address: ADDRESS_A, network: 'ethereum', label: 'x', expectedNative: '1', tokens: [] },
]).add.length === 1)
check('empty input adds nothing', mergeShared([], []).add.length === 0)

/* ---------- Trust Wallet guidance ---------- */
const steps = trustWalletSteps('base', 'Base treasury')
check('steps are numbered', steps.length === 5)
check('steps name the network', steps.some((step) => step.includes('Base')))
check('steps name the wallet', steps.some((step) => step.includes('Base treasury')))
check('steps use the view-only entry', steps.some((step) => step.includes('View-only wallet')))
check('steps mention the QR', steps.some((step) => step.toLowerCase().includes('scan')))

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed:`)
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('All share checks passed.\n')
