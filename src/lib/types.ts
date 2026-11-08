export type WalletStatus = 'unknown' | 'match' | 'below' | 'above'

export interface Snapshot {
  t: number
  eth: string
}

export interface Wallet {
  id: string
  /** EIP-55 checksummed address. Read-only: no key material is ever stored. */
  address: string
  label: string
  /** The amount (ETH) the user assigns to this wallet. */
  expectedEth: string
  note: string
  createdAt: number
  lastEth: string | null
  lastCheckedAt: number | null
  status: WalletStatus
  history: Snapshot[]
}

export interface Settings {
  /** Empty string = use the built-in public RPC list. */
  rpcUrl: string
  /** Allowed difference between expected and actual before it counts as drift. */
  toleranceEth: string
  /** 0 disables auto-refresh. */
  autoRefreshSeconds: number
  notifications: boolean
}

export type AlertKind = 'moved-down' | 'moved-up' | 'back-in-line' | 'mismatch' | 'error'

export interface AlertEntry {
  id: string
  walletId: string
  label: string
  address: string
  kind: AlertKind
  message: string
  expectedEth: string
  actualEth: string | null
  at: number
}

export interface DB {
  version: 1
  wallets: Wallet[]
  settings: Settings
  alerts: AlertEntry[]
}

export interface NewWalletInput {
  address: string
  label: string
  expectedEth: string
  note: string
}
