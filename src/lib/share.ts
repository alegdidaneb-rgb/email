import { getAddress, isAddress } from 'viem'
import { NETWORKS } from './networks'
import type { NetworkId, Wallet } from './types'

/**
 * Cross-device transfer of watched wallets.
 *
 * Everything here is public-key-only: an address, the network it lives on, the
 * label you gave it and the amount you assigned to it. No key material exists in
 * this app, so nothing sensitive can leak — a share link is safe to put in a QR
 * code, a message or a note.
 */

export interface SharedToken {
  address: string
  symbol: string
  decimals: number
  expectedAmount: string
}

export interface SharedWallet {
  address: string
  network: NetworkId
  label: string
  expectedNative: string
  tokens: SharedToken[]
}

export interface ShareBundle {
  version: 1
  sharedAt: number
  wallets: SharedWallet[]
}

/** Prefix so a stray base64 string is never mistaken for a bundle. */
export const SHARE_PREFIX = 'wv1.'
/** Hash key used by share links: `#i=wv1.…`. */
export const SHARE_HASH_KEY = 'i'

const AMOUNT = /^\d{1,30}(\.\d{1,30})?$/

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | null {
  try {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

const isNetwork = (value: unknown): value is NetworkId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(NETWORKS, value)

const cleanAmount = (value: unknown): string => {
  if (typeof value !== 'string') return '0'
  const trimmed = value.trim()
  return AMOUNT.test(trimmed) ? trimmed : '0'
}

const cleanLabel = (value: unknown, address: string): string => {
  if (typeof value !== 'string') return `${address.slice(0, 6)}…${address.slice(-4)}`
  const trimmed = value.trim().slice(0, 48)
  return trimmed || `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** A wallet reduced to exactly the fields worth carrying to another device. */
export function toSharedWallet(wallet: Wallet): SharedWallet {
  return {
    address: getAddress(wallet.address),
    network: wallet.network,
    label: cleanLabel(wallet.label, wallet.address),
    expectedNative: cleanAmount(wallet.expectedNative),
    tokens: wallet.tokens.map((token) => ({
      address: getAddress(token.tokenAddress),
      symbol: (token.symbol || 'TOKEN').slice(0, 12),
      decimals: Number.isInteger(token.decimals) ? Math.min(Math.max(token.decimals, 0), 36) : 18,
      expectedAmount: cleanAmount(token.expectedAmount),
    })),
  }
}

export function encodeShare(wallets: Wallet[], sharedAt = Date.now()): string {
  const bundle: ShareBundle = {
    version: 1,
    sharedAt,
    wallets: wallets.map(toSharedWallet),
  }
  return SHARE_PREFIX + toBase64Url(JSON.stringify(bundle))
}

/** Strict decode: anything malformed returns null instead of a half-broken import. */
export function decodeShare(raw: string): ShareBundle | null {
  const payload = raw.trim().replace(/^#?i=/, '').replace(/^#/, '')
  const body = payload.startsWith(SHARE_PREFIX) ? payload.slice(SHARE_PREFIX.length) : payload
  const json = fromBase64Url(body)
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const source = parsed as { version?: unknown; sharedAt?: unknown; wallets?: unknown }
  if (!Array.isArray(source.wallets)) return null

  const wallets: SharedWallet[] = []
  for (const entry of source.wallets) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.address !== 'string' || !isAddress(candidate.address)) continue
    if (!isNetwork(candidate.network)) continue

    let address: string
    try {
      address = getAddress(candidate.address)
    } catch {
      continue
    }

    const tokens: SharedToken[] = []
    if (Array.isArray(candidate.tokens)) {
      for (const token of candidate.tokens) {
        if (!token || typeof token !== 'object') continue
        const item = token as Record<string, unknown>
        if (typeof item.address !== 'string' || !isAddress(item.address)) continue
        try {
          tokens.push({
            address: getAddress(item.address),
            symbol: typeof item.symbol === 'string' ? item.symbol.slice(0, 12) : 'TOKEN',
            decimals:
              typeof item.decimals === 'number' && Number.isInteger(item.decimals)
                ? Math.min(Math.max(item.decimals, 0), 36)
                : 18,
            expectedAmount: cleanAmount(item.expectedAmount),
          })
        } catch {
          /* skip unusable token */
        }
      }
    }

    wallets.push({
      address,
      network: candidate.network,
      label: cleanLabel(candidate.label, address),
      expectedNative: cleanAmount(candidate.expectedNative),
      tokens,
    })
  }

  if (wallets.length === 0) return null
  return {
    version: 1,
    sharedAt: typeof source.sharedAt === 'number' ? source.sharedAt : Date.now(),
    wallets,
  }
}

/**
 * A link that adds these wallets, assigned amounts included, on whatever device
 * opens it — paste it in a chat with yourself or point a phone at the QR code.
 */
export function shareLink(wallets: Wallet[], base?: string): string {
  const root =
    base ??
    (typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://watchvault-algedi.vercel.app/')
  return `${root.replace(/[?#].*$/, '')}#${SHARE_HASH_KEY}=${encodeShare(wallets)}`
}

/** Reads a bundle out of `location.hash` / `location.search` (or a whole URL). */
export function readShare(hashOrUrl: string): ShareBundle | null {
  if (!hashOrUrl) return null
  const text = hashOrUrl.trim()

  const hashMatch = text.match(new RegExp(`#(?:${SHARE_HASH_KEY}|import)=(wv1\\.[A-Za-z0-9_-]+)`))
  if (hashMatch) return decodeShare(hashMatch[1])

  const queryMatch = text.match(new RegExp(`[?&](?:${SHARE_HASH_KEY}|import)=(wv1\\.[A-Za-z0-9_-]+)`))
  if (queryMatch) return decodeShare(queryMatch[1])

  return decodeShare(text)
}

export interface MergeResult {
  add: SharedWallet[]
  skipped: SharedWallet[]
}

/** New wallets only — the same address on the same network is never added twice. */
export function mergeShared(existing: Wallet[], shared: SharedWallet[]): MergeResult {
  const seen = new Set(existing.map((wallet) => `${wallet.network}:${wallet.address.toLowerCase()}`))
  const add: SharedWallet[] = []
  const skipped: SharedWallet[] = []
  for (const wallet of shared) {
    const key = `${wallet.network}:${wallet.address.toLowerCase()}`
    if (seen.has(key)) {
      skipped.push(wallet)
      continue
    }
    seen.add(key)
    add.push(wallet)
  }
  return { add, skipped }
}

export const hasShareInLocation = (search: string, hash: string): boolean =>
  readShare(hash) !== null || readShare(search) !== null

/** Numbered instructions for Trust Wallet's view-only ("watch") import. */
export function trustWalletSteps(network: NetworkId, label: string): string[] {
  const config = NETWORKS[network] ?? NETWORKS.ethereum
  return [
    'Open Trust Wallet and tap the gear icon to reach Settings.',
    'Tap Wallets, then “+”, then “Add existing wallet”.',
    `Choose “View-only wallet” and pick ${config.name}.`,
    'Scan the code above (or paste the address) — same address, nothing secret.',
    `Name it “${label}” and confirm. It is now on that device too.`,
  ]
}
