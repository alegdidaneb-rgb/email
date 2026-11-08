import { createPublicClient, fallback, formatEther, getAddress, http } from 'viem'
import { mainnet } from 'viem/chains'

/**
 * Public, keyless Ethereum mainnet endpoints. The app calls these straight from
 * the browser, so only endpoints that send permissive CORS headers are listed.
 * They are tried in order until one answers.
 */
export const DEFAULT_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://cloudflare-eth.com',
  'https://eth.llamarpc.com',
  'https://eth.drpc.org',
  'https://1rpc.io/eth',
  'https://rpc.ankr.com/eth',
]

export function makeClient(customRpcUrl: string) {
  const urls = customRpcUrl.trim() ? [customRpcUrl.trim()] : DEFAULT_RPCS
  return createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((url) => http(url, { timeout: 10_000, retryCount: 0 })),
      { rank: false, retryCount: 0 },
    ),
  })
}

export type EthClient = ReturnType<typeof makeClient>

/** Reads the real on-chain ETH balance (18-decimal string) for a watch-only address. */
export async function fetchEthBalance(client: EthClient, address: string): Promise<string> {
  const wei = await client.getBalance({ address: address as `0x${string}` })
  return formatEther(wei)
}

export type AddressResult =
  | { ok: true; address: string }
  | { ok: false; error: string }

/** Validates a 0x address and returns its EIP-55 checksummed form. */
export function normalizeAddress(input: string): AddressResult {
  const value = input.trim()
  if (!value) return { ok: false, error: 'Enter an Ethereum address.' }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return { ok: false, error: 'An Ethereum address is 0x followed by 40 hex characters.' }
  }
  try {
    return { ok: true, address: getAddress(value) }
  } catch {
    return { ok: false, error: 'Mixed-case checksum is invalid — copy the address again.' }
  }
}

/** Accepts "1", "0.25", ".5" and rejects junk. */
export function normalizeAmount(input: string): { ok: true; amount: string } | { ok: false; error: string } {
  const value = input.trim().replace(',', '.')
  if (!value) return { ok: false, error: 'Enter an amount.' }
  if (!/^\d*\.?\d{0,18}$/.test(value)) return { ok: false, error: 'Use digits only, e.g. 1.5' }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Amount must be zero or more.' }
  return { ok: true, amount: value.startsWith('.') ? `0${value}` : value }
}

export function evaluateStatus(
  actualEth: string | null,
  expectedEth: string,
  toleranceEth: number,
): WalletStatusResult {
  if (actualEth === null) return { status: 'unknown', diff: null }
  const actual = Number(actualEth)
  const expected = Number(expectedEth)
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return { status: 'unknown', diff: null }
  const diff = actual - expected
  if (Math.abs(diff) <= Math.max(toleranceEth, 0)) return { status: 'match', diff }
  return { status: diff < 0 ? 'below' : 'above', diff }
}

export interface WalletStatusResult {
  status: 'unknown' | 'match' | 'below' | 'above'
  diff: number | null
}
