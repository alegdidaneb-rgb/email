import {
  createPublicClient,
  erc20Abi,
  fallback,
  formatEther,
  formatUnits,
  getAddress,
  http,
  type Chain,
} from 'viem'
import { NETWORKS } from './networks'
import type { AssetStatus, NetworkId } from './types'

/**
 * One client per network. Calls go out from the browser, so only endpoints with
 * permissive CORS headers are used; the fallback transport moves to the next
 * endpoint when one refuses or times out.
 */
export function makeClient(network: NetworkId, customRpcUrl: string) {
  const config = NETWORKS[network] ?? NETWORKS.ethereum
  const urls = customRpcUrl.trim() ? [customRpcUrl.trim()] : config.rpcUrls
  return createPublicClient({
    chain: config.chain as Chain,
    transport: fallback(
      urls.map((url) => http(url, { timeout: 10_000, retryCount: 0 })),
      { rank: false, retryCount: 0 },
    ),
  })
}

export type EthClient = ReturnType<typeof makeClient>

/** Native-asset balance as a decimal string (e.g. "1.5234"). */
export async function fetchNativeBalance(client: EthClient, address: string): Promise<string> {
  const wei = await client.getBalance({ address: address as `0x${string}` })
  return formatEther(wei)
}

/** Reads an ERC-20 balance and scales it by the token's decimals. */
export async function fetchTokenBalance(
  client: EthClient,
  tokenAddress: string,
  holder: string,
  decimals: number,
): Promise<string> {
  const raw = await client.readContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [holder as `0x${string}`],
  })
  return formatUnits(raw, decimals)
}

export interface TokenMeta {
  symbol: string
  decimals: number
}

/** Reads symbol + decimals straight off the contract. Throws if it is not a token. */
export async function fetchTokenMeta(client: EthClient, tokenAddress: string): Promise<TokenMeta> {
  const target = tokenAddress as `0x${string}`
  const rawDecimals = await client.readContract({
    address: target,
    abi: erc20Abi,
    functionName: 'decimals',
  })
  const decimals = Number(rawDecimals)
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) {
    throw new Error('Contract returned unusable decimals')
  }
  let symbol = ''
  try {
    const rawSymbol = await client.readContract({
      address: target,
      abi: erc20Abi,
      functionName: 'symbol',
    })
    if (typeof rawSymbol === 'string') symbol = rawSymbol.replace(/\u0000/g, '').trim()
  } catch {
    // Older tokens return bytes32; leave the symbol empty and let the UI fall back.
  }
  return { symbol, decimals }
}

export type AddressResult = { ok: true; address: string } | { ok: false; error: string }

/** Validates a 0x address and returns its EIP-55 checksummed form. */
export function normalizeAddress(input: string): AddressResult {
  const value = input.trim()
  if (!value) return { ok: false, error: 'Enter an address.' }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return { ok: false, error: 'An address is 0x followed by 40 hex characters.' }
  }
  try {
    return { ok: true, address: getAddress(value) }
  } catch {
    return { ok: false, error: 'Mixed-case checksum is invalid — copy the address again.' }
  }
}

/** Accepts "1", "0.25", ".5" and rejects junk. */
export function normalizeAmount(
  input: string,
): { ok: true; amount: string } | { ok: false; error: string } {
  const value = input.trim().replace(',', '.')
  if (!value) return { ok: false, error: 'Enter an amount.' }
  if (!/^\d*\.?\d{0,18}$/.test(value)) return { ok: false, error: 'Use digits only, e.g. 1.5' }
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Amount must be zero or more.' }
  return { ok: true, amount: value.startsWith('.') ? `0${value}` : value }
}

export function evaluateStatus(
  actual: string | null,
  expected: string,
  tolerance: number,
): AssetStatus {
  if (actual === null) return 'unknown'
  const a = Number(actual)
  const e = Number(expected)
  if (!Number.isFinite(a) || !Number.isFinite(e)) return 'unknown'
  const diff = a - e
  if (Math.abs(diff) <= Math.max(tolerance, 0)) return 'match'
  return diff < 0 ? 'below' : 'above'
}

export function assetGap(actual: string | null, expected: string): number | null {
  if (actual === null) return null
  const a = Number(actual)
  const e = Number(expected)
  if (!Number.isFinite(a) || !Number.isFinite(e)) return null
  return a - e
}

const severity: Record<AssetStatus, number> = { unknown: 0, match: 1, above: 2, below: 3 }

/** Worst of several asset statuses — drives the wallet card accent and filters. */
export function combineStatus(statuses: AssetStatus[]): AssetStatus {
  if (statuses.length === 0) return 'unknown'
  return statuses.reduce<AssetStatus>(
    (worst, current) => (severity[current] > severity[worst] ? current : worst),
    'unknown',
  )
}
