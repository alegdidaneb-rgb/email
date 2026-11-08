export type NetworkId = 'ethereum' | 'base' | 'arbitrum' | 'optimism' | 'polygon'

export type AssetStatus = 'unknown' | 'match' | 'below' | 'above'

export interface Snapshot {
  t: number
  amount: string
}

export interface TokenHolding {
  id: string
  /** EIP-55 checksummed ERC-20 contract address. */
  tokenAddress: string
  symbol: string
  decimals: number
  /** The amount (token units) the user assigns to this holding. */
  expectedAmount: string
  lastAmount: string | null
  lastCheckedAt: number | null
  status: AssetStatus
}

export interface Wallet {
  id: string
  /** EIP-55 checksummed address. Read-only: no key material is ever stored. */
  address: string
  network: NetworkId
  label: string
  note: string
  createdAt: number
  /** Native-asset amount the user assigns to this wallet. */
  expectedNative: string
  lastNative: string | null
  lastCheckedAt: number | null
  /** Status of the native asset; tokens carry their own. */
  status: AssetStatus
  history: Snapshot[]
  tokens: TokenHolding[]
}

export interface Settings {
  /** Optional per-network RPC override. Empty = built-in public pool. */
  customRpcs: Partial<Record<NetworkId, string>>
  /** Allowed drift for the native asset, in native units. */
  toleranceNative: string
  /** Allowed drift for ERC-20 holdings, in token units. */
  toleranceToken: string
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
  network: NetworkId
  /** Symbol of the asset that moved, e.g. ETH or USDC. */
  asset: string
  kind: AlertKind
  message: string
  expected: string
  actual: string | null
  at: number
}

export interface DB {
  version: 2
  wallets: Wallet[]
  settings: Settings
  alerts: AlertEntry[]
}

export interface NewWalletInput {
  address: string
  network: NetworkId
  label: string
  expectedNative: string
  note: string
}
