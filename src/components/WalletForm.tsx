import { useState, type FormEvent } from 'react'
import { normalizeAddress, normalizeAmount } from '../lib/eth'
import { Icon } from './Icon'
import type { NewWalletInput } from '../lib/types'

interface Props {
  knownAddresses: string[]
  onAdd: (input: NewWalletInput) => void
}

export function WalletForm({ knownAddresses, onAdd }: Props) {
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedAddress = normalizeAddress(address)
    if (!parsedAddress.ok) {
      setError(parsedAddress.error)
      return
    }
    if (knownAddresses.some((a) => a.toLowerCase() === parsedAddress.address.toLowerCase())) {
      setError('That address is already on your watchlist.')
      return
    }
    const parsedAmount = normalizeAmount(amount)
    if (!parsedAmount.ok) {
      setError(parsedAmount.error)
      return
    }
    onAdd({
      address: parsedAddress.address,
      label: label.trim() || 'Untitled wallet',
      expectedEth: parsedAmount.amount,
      note: note.trim(),
    })
    setAddress('')
    setLabel('')
    setAmount('')
    setNote('')
    setError(null)
  }

  return (
    <form className="card form-card" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Watch a wallet</h2>
        <span className="badge badge-lock">
          <Icon name="shield" size={12} /> read-only
        </span>
      </div>
      <p className="card-sub">
        Paste a public address. No private key, no signature, no ability to move funds.
      </p>

      <label className="field">
        <span className="field-label">Ethereum address</span>
        <input
          className="input mono"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value)
            setError(null)
          }}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
        />
      </label>

      <label className="field">
        <span className="field-label">Label</span>
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ledger cold storage"
          maxLength={60}
        />
      </label>

      <label className="field">
        <span className="field-label">
          Amount assigned <span className="field-hint">ETH this wallet should hold</span>
        </span>
        <div className="input-wrap">
          <input
            className="input mono"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            placeholder="1.5"
            inputMode="decimal"
            autoComplete="off"
          />
          <span className="input-suffix">ETH</span>
        </div>
      </label>

      <label className="field">
        <span className="field-label">
          Note <span className="field-hint">optional</span>
        </span>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Seed phrase in the safe deposit box"
          maxLength={120}
        />
      </label>

      {error && (
        <p className="field-error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary btn-block">
        <Icon name="plus" size={15} /> Add to watchlist
      </button>
    </form>
  )
}
