/** Formats an asset amount with grouping and up to `maxDecimals` fraction digits. */
export function formatAmount(value: string | number | null, maxDecimals = 6): string {
  if (value === null) return '—'
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const decimals = abs > 0 && abs < 0.001 ? Math.min(18, maxDecimals + 6) : maxDecimals
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

/** Compact gap / drift figure for tight spaces. */
export function formatCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs < 0.000001) return '<0.000001'
  if (abs < 0.0001) return '<0.0001'
  return formatAmount(value, abs < 1 ? 6 : 4)
}

export function formatTokenAmount(value: string | null, decimals: number): string {
  if (value === null) return '—'
  return formatAmount(value, Math.min(Math.max(decimals, 0), 6))
}

export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

export function relativeTime(ts: number | null): string {
  if (!ts) return 'never'
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
