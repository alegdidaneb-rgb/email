import { useState } from 'react'
import { normalizeAmount } from '../lib/eth'
import { formatEth, formatEthCompact, relativeTime, shortenAddress } from '../lib/format'
import type { Wallet } from '../lib/types'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'
import { Sparkline } from './Sparkline'

interface Props {
  wallet: Wallet
  toleranceEth: number
  checking: boolean
  onRefresh: () => void
  onUpdate: (patch: Partial<Wallet>) => void
  onRemove: () => void
  onReconcile: () => void
}

const statusCopy = {
  match: { label: 'Matches', className: 'is-match' },
  below: { label: 'Below assigned', className: 'is-below' },
  above: { label: 'Above assigned', className: 'is-above' },
  unknown: { label: 'Not checked', className: 'is-unknown' },
} as const

export function WalletCard({
  wallet,
  toleranceEth,
  checking,
  onRefresh,
  onUpdate,
  onRemove,
  onReconcile,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState(wallet.label)
  const [draftAmount, setDraftAmount] = useState(wallet.expectedEth)
  const [draftNote, setDraftNote] = useState(wallet.note)
  const [error, setError] = useState<string | null>(null)

  const meta = statusCopy[wallet.status]
  const actual = wallet.lastEth === null ? null : Number(wallet.lastEth)
  const expected = Number(wallet.expectedEth)
  const diff = actual === null ? null : actual - expected
  const offBy = diff !== null && Math.abs(diff) > Math.max(toleranceEth, 0) ? diff : null

  function startEdit() {
    setDraftLabel(wallet.label)
    setDraftAmount(wallet.expectedEth)
    setDraftNote(wallet.note)
    setError(null)
    setEditing(true)
  }

  function saveEdit() {
    const parsed = normalizeAmount(draftAmount)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    onUpdate({
      label: draftLabel.trim() || 'Untitled wallet',
      expectedEth: parsed.amount,
      note: draftNote.trim(),
    })
    setEditing(false)
  }

  return (
    <article className={`wallet-card ${meta.className}`}>
      <header className="wallet-head">
        <div className="wallet-id">
          <h3>{wallet.label}</h3>
          <div className="wallet-address">
            <span className="mono" title={wallet.address}>
              {shortenAddress(wallet.address, 10, 8)}
            </span>
            <CopyButton address={wallet.address} />
            <a
              className="icon-btn"
              href={`https://etherscan.io/address/${wallet.address}`}
              target="_blank"
              rel="noreferrer noopener"
              title="Open in Etherscan"
              aria-label="Open in Etherscan"
            >
              <Icon name="external" size={14} />
            </a>
          </div>
        </div>
        <div className="wallet-head-right">
          <span className={`status-pill ${meta.className}`}>
            <i aria-hidden="true" /> {meta.label}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={onRefresh}
            disabled={checking}
            title="Check this address now"
            aria-label="Check this address now"
          >
            <Icon name="refresh" size={14} className={checking ? 'spin' : undefined} />
          </button>
        </div>
      </header>

      {editing ? (
        <div className="wallet-edit">
          <label className="field">
            <span className="field-label">Label</span>
            <input
              className="input"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              maxLength={60}
            />
          </label>
          <label className="field">
            <span className="field-label">
              Amount assigned <span className="field-hint">ETH</span>
            </span>
            <input
              className="input mono"
              value={draftAmount}
              onChange={(e) => {
                setDraftAmount(e.target.value)
                setError(null)
              }}
              inputMode="decimal"
            />
          </label>
          <label className="field field-wide">
            <span className="field-label">
              Note <span className="field-hint">optional</span>
            </span>
            <input
              className="input"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              maxLength={120}
            />
          </label>
          {error && (
            <p className="field-error" role="alert">
              <Icon name="alert" size={14} /> {error}
            </p>
          )}
          <div className="wallet-edit-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit}>
              <Icon name="check" size={14} /> Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="wallet-metrics">
            <div className="metric">
              <span className="metric-label">On-chain now</span>
              <span className="metric-value mono">
                {formatEth(wallet.lastEth, 6)}
                <em>ETH</em>
              </span>
            </div>
            <div className="metric metric-right">
              <span className="metric-label">Assigned</span>
              <span className="metric-value mono">
                {formatEth(wallet.expectedEth, 6)}
                <em>ETH</em>
              </span>
            </div>
          </div>

          <div className="wallet-delta">
            {wallet.lastEth === null ? (
              <span className="delta delta-unknown">
                <Icon name="clock" size={13} /> Waiting for the first reading
              </span>
            ) : offBy === null ? (
              <span className="delta delta-match">
                <Icon name="check" size={13} /> Within {formatEth(toleranceEth, 6)} ETH of the
                assigned amount
              </span>
            ) : (
              <span className={`delta ${offBy < 0 ? 'delta-down' : 'delta-up'}`}>
                <Icon name="alert" size={13} />
                {offBy < 0 ? 'Short by' : 'Over by'} {formatEthCompact(Math.abs(offBy))} ETH
                {' · '}
                {offBy < 0 ? 'funds left this wallet' : 'funds arrived'}
                <button type="button" className="link-btn" onClick={onReconcile}>
                  Assign current amount
                </button>
              </span>
            )}
          </div>

          {wallet.history.length > 1 && (
            <Sparkline history={wallet.history} expected={expected} />
          )}

          {wallet.note && <p className="wallet-note">{wallet.note}</p>}

          <footer className="wallet-foot">
            <span className="wallet-foot-left">
              <Icon name="clock" size={12} /> checked {relativeTime(wallet.lastCheckedAt)}
            </span>
            <span className="wallet-foot-actions">
              <button type="button" className="btn btn-ghost btn-xs" onClick={startEdit}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-danger"
                onClick={onRemove}
                title="Remove from watchlist"
              >
                <Icon name="trash" size={13} /> Remove
              </button>
            </span>
          </footer>
        </>
      )}
    </article>
  )
}
