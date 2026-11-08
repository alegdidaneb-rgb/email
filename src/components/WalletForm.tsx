import { useState, type FormEvent } from 'react'
import { normalizeAddress, normalizeAmount } from '../lib/eth'
import { networkOf, MAINNETS, TESTNETS } from '../lib/networks'
import type { NetworkId, NewWalletInput } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  known: { address: string; network: NetworkId }[]
  onAdd: (input: NewWalletInput) => void
}

export function WalletForm({ known, onAdd }: Props) {
  const [network, setNetwork] = useState<NetworkId>('ethereum')
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const config = networkOf(network)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedAddress = normalizeAddress(address)
    if (!parsedAddress.ok) {
      setError(parsedAddress.error)
      return
    }
    const duplicate = known.some(
      (item) =>
        item.network === network &&
        item.address.toLowerCase() === parsedAddress.address.toLowerCase(),
    )
    if (duplicate) {
      setError(`That address is already watched on ${config.name}.`)
      return
    }
    const parsedAmount = normalizeAmount(amount)
    if (!parsedAmount.ok) {
      setError(parsedAmount.error)
      return
    }
    onAdd({
      address: parsedAddress.address,
      network,
      label: label.trim() || 'Untitled wallet',
      expectedNative: parsedAmount.amount,
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
        <span className="field-label">Network</span>
        <select
          className="input"
          value={network}
          onChange={(e) => {
            setNetwork(e.target.value as NetworkId)
            setError(null)
          }}
        >
          <optgroup label="Mainnets">
            {MAINNETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.nativeSymbol}
              </option>
            ))}
          </optgroup>
          <optgroup label="Testnets (free, valueless ETH)">
            {TESTNETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.nativeSymbol}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      {config.testnet && (
        <p className="faucet-hint">
          <Icon name="alert" size={12} />
          <span>
            {config.name} ETH is free and worth nothing — grab some from a{' '}
            <a href={config.faucet} target="_blank" rel="noreferrer noopener">
              {config.name} faucet
            </a>{' '}
            and watch the assigned amount match for real.
          </span>
        </p>
      )}

      <label className="field">
        <span className="field-label">Address</span>
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
          Amount assigned <span className="field-hint">{config.nativeSymbol} this wallet should hold</span>
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
          <span className="input-suffix">{config.nativeSymbol}</span>
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
          placeholder="Cold storage, safe deposit box"
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
      <p className="form-tip">
        <Icon name="token" size={12} /> ERC-20 tokens are added per wallet, from the wallet card.
      </p>
    </form>
  )
}
