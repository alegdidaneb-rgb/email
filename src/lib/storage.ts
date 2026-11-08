import type { AlertEntry, DB, Settings, Wallet } from './types'

const STORAGE_KEY = 'watchvault.db.v1'
const MAX_ALERTS = 120
const MAX_HISTORY = 40

export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: '',
  toleranceEth: '0.0005',
  autoRefreshSeconds: 60,
  notifications: false,
}

export function emptyDb(): DB {
  return { version: 1, wallets: [], settings: { ...DEFAULT_SETTINGS }, alerts: [] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceWallet(raw: unknown): Wallet | null {
  if (!isRecord(raw)) return null
  const address = typeof raw.address === 'string' ? raw.address : ''
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    address,
    label: typeof raw.label === 'string' ? raw.label : '',
    expectedEth: typeof raw.expectedEth === 'string' ? raw.expectedEth : String(raw.expectedEth ?? '0'),
    note: typeof raw.note === 'string' ? raw.note : '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    lastEth: typeof raw.lastEth === 'string' ? raw.lastEth : null,
    lastCheckedAt: typeof raw.lastCheckedAt === 'number' ? raw.lastCheckedAt : null,
    status:
      raw.status === 'match' || raw.status === 'below' || raw.status === 'above'
        ? raw.status
        : 'unknown',
    history: Array.isArray(raw.history)
      ? raw.history
          .filter(
            (s): s is { t: number; eth: string } =>
              isRecord(s) && typeof s.t === 'number' && typeof s.eth === 'string',
          )
          .slice(-MAX_HISTORY)
      : [],
  }
}

function coerceAlert(raw: unknown): AlertEntry | null {
  if (!isRecord(raw) || typeof raw.message !== 'string') return null
  return {
    id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
    walletId: typeof raw.walletId === 'string' ? raw.walletId : '',
    label: typeof raw.label === 'string' ? raw.label : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    kind:
      raw.kind === 'moved-down' ||
      raw.kind === 'moved-up' ||
      raw.kind === 'back-in-line' ||
      raw.kind === 'mismatch' ||
      raw.kind === 'error'
        ? raw.kind
        : 'mismatch',
    message: raw.message,
    expectedEth: typeof raw.expectedEth === 'string' ? raw.expectedEth : '0',
    actualEth: typeof raw.actualEth === 'string' ? raw.actualEth : null,
    at: typeof raw.at === 'number' ? raw.at : Date.now(),
  }
}

export function parseDb(parsed: unknown): DB {
  if (!isRecord(parsed)) return emptyDb()
  const settings = isRecord(parsed.settings) ? parsed.settings : {}
  return {
      version: 1,
      wallets: Array.isArray(parsed.wallets)
        ? parsed.wallets.map(coerceWallet).filter((w): w is Wallet => w !== null)
        : [],
      settings: {
        rpcUrl: typeof settings.rpcUrl === 'string' ? settings.rpcUrl : DEFAULT_SETTINGS.rpcUrl,
        toleranceEth:
          typeof settings.toleranceEth === 'string'
            ? settings.toleranceEth
            : DEFAULT_SETTINGS.toleranceEth,
        autoRefreshSeconds:
          typeof settings.autoRefreshSeconds === 'number'
            ? settings.autoRefreshSeconds
            : DEFAULT_SETTINGS.autoRefreshSeconds,
        notifications: settings.notifications === true,
      },
    alerts: Array.isArray(parsed.alerts)
      ? parsed.alerts
          .map(coerceAlert)
          .filter((a): a is AlertEntry => a !== null)
          .slice(0, MAX_ALERTS)
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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...db, alerts: db.alerts.slice(0, MAX_ALERTS) }),
    )
  } catch {
    /* storage full or blocked — the app keeps working in memory */
  }
}

export function capHistory(history: { t: number; eth: string }[]): { t: number; eth: string }[] {
  return history.slice(-MAX_HISTORY)
}

export function capAlerts(alerts: AlertEntry[]): AlertEntry[] {
  return alerts.slice(0, MAX_ALERTS)
}
