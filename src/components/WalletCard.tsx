import { useState, type FormEvent } from 'react'
import { assetGap, combineStatus, normalizeAmount } from '../lib/eth'
import {
  formatAmount,
  formatCompact,
  formatTokenAmount,
  relativeTime,
  shortenAddress,
} from '../lib/format'
import { networkOf } from '../lib/networks'
import type { AssetStatus, TokenHolding, Wallet } from '../lib/types'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'
import { Sparkline } from './Sparkline'

interface Props {
  wallet: Wallet
  toleranceNative: number
  checking: boolean
  readFailed: boolean
  onRefresh: () => void
  onUpdate: (patch: Partial<Wallet>) => void
  onRemove: () => void
  onReconcileNative: () => void
  onAddToken: (tokenAddress: string, expectedAmount: string) => Promise<string | null>
  onUpdateToken: (tokenId: string, patch: Partial<TokenHolding>) => void
  onRemoveToken: (tokenId: string) => void
  onReconcileToken: (token: TokenHolding) => void
}

const statusCopy: Record<AssetStatus, { label: string; className: string }> = {
  match: { label: 'Matches', className: 'is-match' },
  below: { label: 'Below assigned', className: 'is-below' },
  above: { label: 'Above assigned', className: 'is-above' },
  unknown: { label: 'Not checked', className: 'is-unknown' },
}

export function WalletCard({
  wallet,
  toleranceNative,
  checking,
  readFailed,
  onRefresh,
  onUpdate,
  onRemove,
  onReconcileNative,
  onAddToken,
  onUpdateToken,
  onRemoveToken,
  onReconcileToken,
}: Props) {
  const config = networkOf(wallet.network)
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState(wallet.label)
  const [draftAmount, setDraftAmount] = useState(wallet.expectedNative)
  const [draftNote, setDraftNote] = useState(wallet.note)
  const [error, setError] = useState<string | null>(null)

  const [tokenFormOpen, setTokenFormOpen] = useState(false)
  const [tokenAddress, setTokenAddress] = useState('')
  const [tokenAmount, setTokenAmount] = useState('')
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null)
  const [tokenDraftAmount, setTokenDraftAmount] = useState('')

  const overall = combineStatus([wallet.status, ...wallet.tokens.map((token) => token.status)])
  const meta = statusCopy[overall]

  const actual = wallet.lastNative === null ? null : Number(wallet.lastNative)
  const expected = Number(wallet.expectedNative)
  const diff = actual === null ? null : actual - expected
  const offBy = diff !== null && Math.abs(diff) > Math.max(toleranceNative, 0) ? diff : null

  function startEdit() {
    setDraftLabel(wallet.label)
    setDraftAmount(wallet.expectedNative)
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
      expectedNative: parsed.amount,
      note: draftNote.trim(),
    })
    setEditing(false)
  }

  async function submitToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTokenBusy(true)
    setTokenError(null)
    const message = await onAddToken(tokenAddress, tokenAmount)
    setTokenBusy(false)
    if (message) {
      setTokenError(message)
      return
    }
    setTokenFormOpen(false)
    setTokenAddress('')
    setTokenAmount('')
  }

  function startTokenEdit(token: TokenHolding) {
    setEditingTokenId(token.id)
    setTokenDraftAmount(token.expectedAmount)
  }

  function saveTokenEdit(token: TokenHolding) {
    const parsed = normalizeAmount(tokenDraftAmount)
    if (!parsed.ok) return
    onUpdateToken(token.id, { expectedAmount: parsed.amount })
    setEditingTokenId(null)
  }

  return (
    <article className={`wallet-card ${meta.className}`}>
      <header className="wallet-head">
        <div className="wallet-id">
          <div className="wallet-title-row">
            <span className="net-badge">
              <i style={{ background: config.accent }} aria-hidden="true" />
              {config.name}
            </span>
            {config.testnet && <span className="testnet-chip">testnet</span>}
            <h3>{wallet.label}</h3>
          </div>
          <div className="wallet-address">
            <span className="mono" title={wallet.address}>
              {shortenAddress(wallet.address, 10, 8)}
            </span>
            <CopyButton address={wallet.address} />
            <a
              className="icon-btn"
              href={`${config.explorer}/address/${wallet.address}`}
              target="_blank"
              rel="noreferrer noopener"
              title={`Open in ${config.explorerName}`}
              aria-label={`Open in ${config.explorerName}`}
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
            title="Check this wallet now"
            aria-label="Check this wallet now"
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
              Amount assigned <span className="field-hint">{config.nativeSymbol}</span>
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
                {formatAmount(wallet.lastNative, 6)}
                <em>{config.nativeSymbol}</em>
              </span>
            </div>
            <div className="metric metric-right">
              <span className="metric-label">Assigned</span>
              <span className="metric-value mono">
                {formatAmount(wallet.expectedNative, 6)}
                <em>{config.nativeSymbol}</em>
              </span>
            </div>
          </div>

          <div className="wallet-delta">
            {wallet.lastNative === null ? (
              <span className="delta delta-unknown">
                <Icon name="clock" size={13} /> Waiting for the first reading
              </span>
            ) : offBy === null ? (
              <span className="delta delta-match">
                <Icon name="check" size={13} /> Within {formatAmount(toleranceNative, 6)}{' '}
                {config.nativeSymbol} of the assigned amount
              </span>
            ) : (
              <span className={`delta ${offBy < 0 ? 'delta-down' : 'delta-up'}`}>
                <Icon name="alert" size={13} />
                {offBy < 0 ? 'Short by' : 'Over by'} {formatCompact(Math.abs(offBy))}{' '}
                {config.nativeSymbol}
                {' · '}
                {offBy < 0 ? 'funds left this wallet' : 'funds arrived'}
                <button type="button" className="link-btn" onClick={onReconcileNative}>
                  Assign current amount
                </button>
              </span>
            )}
          </div>

          {readFailed && (
            <p className="read-failed">
              <Icon name="alert" size={13} /> Couldn't reach an RPC endpoint for{' '}
              {config.name} just now — the last known balance is shown above. It retries
              automatically.
            </p>
          )}

          {wallet.history.length > 1 && (
            <Sparkline history={wallet.history} expected={expected} />
          )}

          {wallet.tokens.length > 0 && (
            <div className="token-section">
              <span className="token-section-label">
                <Icon name="token" size={12} /> ERC-20 holdings
              </span>
              <ul className="token-list">
                {wallet.tokens.map((token) => {
                  const gap = assetGap(token.lastAmount, token.expectedAmount)
                  const tokenMeta = statusCopy[token.status]
                  return (
                    <li key={token.id} className={`token-row ${tokenMeta.className}`}>
                      <span className="token-dot" aria-hidden="true" />
                      <div className="token-main">
                        <span className="token-balance mono">
                          {formatTokenAmount(token.lastAmount, token.decimals)}
                          <em>{token.symbol}</em>
                        </span>
                        {editingTokenId === token.id ? (
                          <span className="token-edit">
                            <input
                              className="input input-compact mono"
                              value={tokenDraftAmount}
                              inputMode="decimal"
                              onChange={(e) => setTokenDraftAmount(e.target.value)}
                              aria-label="Assigned token amount"
                            />
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              onClick={() => saveTokenEdit(token)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => setEditingTokenId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="token-sub">
                            assigned {formatAmount(token.expectedAmount, 6)}
                            {gap === null
                              ? ' · not checked'
                              : token.status === 'match'
                                ? ' · in line'
                                : ` · ${gap < 0 ? 'short by' : 'over by'} ${formatCompact(Math.abs(gap))}`}
                          </span>
                        )}
                      </div>
                      <div className="token-actions">
                        {(token.status === 'below' || token.status === 'above') && (
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => onReconcileToken(token)}
                          >
                            reconcile
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => startTokenEdit(token)}
                          title="Edit assigned amount"
                          aria-label={`Edit assigned amount for ${token.symbol}`}
                        >
                          <Icon name="settings" size={12} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => onRemoveToken(token.id)}
                          title="Stop tracking this token"
                          aria-label={`Stop tracking ${token.symbol}`}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {tokenFormOpen ? (
            <form className="token-form" onSubmit={submitToken}>
              <input
                className="input input-compact mono"
                value={tokenAddress}
                onChange={(e) => {
                  setTokenAddress(e.target.value)
                  setTokenError(null)
                }}
                placeholder="Token contract 0x…"
                spellCheck={false}
                autoComplete="off"
              />
              <input
                className="input input-compact mono"
                value={tokenAmount}
                onChange={(e) => {
                  setTokenAmount(e.target.value)
                  setTokenError(null)
                }}
                placeholder="Assigned amount"
                inputMode="decimal"
                autoComplete="off"
              />
              <button type="submit" className="btn btn-primary btn-xs" disabled={tokenBusy}>
                {tokenBusy ? 'Reading…' : 'Add token'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setTokenFormOpen(false)
                  setTokenError(null)
                }}
              >
                Cancel
              </button>
              {tokenError && (
                <p className="field-error token-form-error" role="alert">
                  <Icon name="alert" size={13} /> {tokenError}
                </p>
              )}
            </form>
          ) : (
            !editing && (
              <button
                type="button"
                className="btn btn-ghost btn-xs add-token"
                onClick={() => setTokenFormOpen(true)}
              >
                <Icon name="plus" size={13} /> Track ERC-20 token
              </button>
            )
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
