import { isNetworkId, NETWORKS } from './networks'
import type {
  AlertEntry,
  AssetStatus,
  DB,
  NetworkId,
  Settings,
  Snapshot,
  TokenHolding,
  Wallet,
} from './types'

const STORAGE_KEY = 'watchvault.db.v1'
const MAX_ALERTS = 120
const MAX_HISTORY = 40

export const DEFAULT_SETTINGS: Settings = {
  customRpcs: {},
  toleranceNative: '0.0005',
  toleranceToken: '0.01',
  autoRefreshSeconds: 60,
  notifications: false,
}

export function emptyDb(): DB {
  return { version: 2, wallets: [], settings: { ...DEFAULT_SETTINGS, customRpcs: {} }, alerts: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asStatus(value: unknown): AssetStatus {
  return value === 'match' || value === 'below' || value === 'above' ? value : 'unknown'
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback
}

function coerceHistory(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return []
  const out: Snapshot[] = []
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.t !== 'number') continue
    const amount = asString(entry.amount ?? entry.eth, '')
    if (!amount) continue
    out.push({ t: entry.t, amount })
  }
  return out.slice(-MAX_HISTORY)
}

function coerceToken(raw: unknown): TokenHolding | null {
  if (!isRecord(raw)) return null
  const tokenAddress = asString(raw.tokenAddress)
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) return null
  const decimals = Number(raw.decimals)
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    tokenAddress,
    symbol: asString(raw.symbol, 'TOKEN').slice(0, 16) || 'TOKEN',
    decimals: Number.isFinite(decimals) ? decimals : 18,
    expectedAmount: asString(raw.expectedAmount, '0'),
    lastAmount: typeof raw.lastAmount === 'string' ? raw.lastAmount : null,
    lastCheckedAt: typeof raw.lastCheckedAt === 'number' ? raw.lastCheckedAt : null,
    status: asStatus(raw.status),
  }
}

function coerceWallet(raw: unknown): Wallet | null {
  if (!isRecord(raw)) return null
  const address = asString(raw.address)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    address,
    network: isNetworkId(raw.network) ? raw.network : 'ethereum',
    label: asString(raw.label, 'Untitled wallet'),
    note: asString(raw.note),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    // v1 stored these as expectedEth / lastEth.
    expectedNative: asString(raw.expectedNative ?? raw.expectedEth, '0'),
    lastNative: typeof raw.lastNative === 'string' ? raw.lastNative : (typeof raw.lastEth === 'string' ? raw.lastEth : null),
    lastCheckedAt: typeof raw.lastCheckedAt === 'number' ? raw.lastCheckedAt : null,
    status: asStatus(raw.status),
    history: coerceHistory(raw.history),
    tokens: Array.isArray(raw.tokens)
      ? raw.tokens.map(coerceToken).filter((token): token is TokenHolding => token !== null)
      : [],
  }
}

function coerceAlert(raw: unknown): AlertEntry | null {
  if (!isRecord(raw) || typeof raw.message !== 'string') return null
  const kind =
    raw.kind === 'moved-down' ||
    raw.kind === 'moved-up' ||
    raw.kind === 'back-in-line' ||
    raw.kind === 'mismatch' ||
    raw.kind === 'error'
      ? raw.kind
      : 'mismatch'
  return {
    id: asString(raw.id) || crypto.randomUUID(),
    walletId: asString(raw.walletId),
    label: asString(raw.label),
    address: asString(raw.address),
    network: isNetworkId(raw.network) ? raw.network : 'ethereum',
    asset: asString(raw.asset, ''),
    kind,
    message: raw.message,
    expected: asString(raw.expected ?? raw.expectedEth, '0'),
    actual: typeof raw.actual === 'string' ? raw.actual : null,
    at: typeof raw.at === 'number' ? raw.at : Date.now(),
  }
}

function coerceSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {}
  const customRpcs: Partial<Record<NetworkId, string>> = {}
  if (isRecord(source.customRpcs)) {
    for (const [key, value] of Object.entries(source.customRpcs)) {
      if (isNetworkId(key) && typeof value === 'string') customRpcs[key] = value
    }
  }
  // v1 had a single global RPC override that only ever applied to mainnet.
  if (typeof source.rpcUrl === 'string' && source.rpcUrl.trim() && !customRpcs.ethereum) {
    customRpcs.ethereum = source.rpcUrl.trim()
  }
  return {
    customRpcs,
    toleranceNative: asString(source.toleranceNative ?? source.toleranceEth, DEFAULT_SETTINGS.toleranceNative),
    toleranceToken: asString(source.toleranceToken, DEFAULT_SETTINGS.toleranceToken),
    autoRefreshSeconds:
      typeof source.autoRefreshSeconds === 'number'
        ? source.autoRefreshSeconds
        : DEFAULT_SETTINGS.autoRefreshSeconds,
    notifications: source.notifications === true,
  }
}

export function parseDb(parsed: unknown): DB {
  if (!isRecord(parsed)) return emptyDb()
  return {
    version: 2,
    wallets: Array.isArray(parsed.wallets)
      ? parsed.wallets.map(coerceWallet).filter((wallet): wallet is Wallet => wallet !== null)
      : [],
    settings: coerceSettings(parsed.settings),
    alerts: Array.isArray(parsed.alerts)
      ? parsed.alerts.map(coerceAlert).filter((alert): alert is AlertEntry => alert !== null).slice(0, MAX_ALERTS)
      : [],
  }
}

export function loadDb(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    return parseDb(JSON.parse(raw))
  } catch {
    return emptyDb()
  }
}

export function saveDb(db: DB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...db, alerts: db.alerts.slice(0, MAX_ALERTS) }))
  } catch {
    /* storage full or blocked — the app keeps working in memory */
  }
}

export function capHistory(history: Snapshot[]): Snapshot[] {
  return history.slice(-MAX_HISTORY)
}

export function capAlerts(alerts: AlertEntry[]): AlertEntry[] {
  return alerts.slice(0, MAX_ALERTS)
}

/** Human-readable network label for a stored id, tolerant of older data. */
export function networkLabel(id: NetworkId): string {
  return NETWORKS[id]?.short ?? 'Ethereum'
}
