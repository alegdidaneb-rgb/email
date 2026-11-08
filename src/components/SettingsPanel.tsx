import { useEffect, useRef, useState } from 'react'
import { normalizeAmount } from '../lib/eth'
import { NETWORK_LIST } from '../lib/networks'
import type { NetworkId, Settings } from '../lib/types'
import { Icon } from './Icon'

interface Props {
  open: boolean
  settings: Settings
  walletCount: number
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
  onExport: () => void
  onImport: (json: string) => string | null
  onClearData: () => void
}

const refreshOptions = [
  { value: 0, label: 'Off' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
]

export function SettingsPanel({
  open,
  settings,
  walletCount,
  onChange,
  onClose,
  onExport,
  onImport,
  onClearData,
}: Props) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [nativeDraft, setNativeDraft] = useState(settings.toleranceNative)
  const [tokenDraft, setTokenDraft] = useState(settings.toleranceToken)
  const [toleranceError, setToleranceError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNativeDraft(settings.toleranceNative)
    setTokenDraft(settings.toleranceToken)
  }, [settings.toleranceNative, settings.toleranceToken])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function commitTolerances() {
    const native = normalizeAmount(nativeDraft)
    if (!native.ok) {
      setToleranceError(`Native tolerance: ${native.error}`)
      return
    }
    const token = normalizeAmount(tokenDraft)
    if (!token.ok) {
      setToleranceError(`Token tolerance: ${token.error}`)
      return
    }
    setToleranceError(null)
    onChange({ toleranceNative: native.amount, toleranceToken: token.amount })
  }

  async function toggleNotifications(next: boolean) {
    if (!next) {
      onChange({ notifications: false })
      return
    }
    if (typeof Notification === 'undefined') return
    const result =
      Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    setPermission(result)
    onChange({ notifications: result === 'granted' })
  }

  function setRpc(network: NetworkId, value: string) {
    onChange({ customRpcs: { ...settings.customRpcs, [network]: value } })
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    const error = onImport(text)
    setImportMessage(error ?? `Imported ${file.name}`)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Settings">
      <button className="drawer-scrim" type="button" aria-label="Close settings" onClick={onClose} />
      <aside className="drawer">
        <header className="drawer-head">
          <h2>
            <Icon name="settings" size={16} /> Settings
          </h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="drawer-body">
          <section className="settings-group">
            <h3>Matching tolerance</h3>
            <p className="settings-hint">
              How far a balance may drift from its assigned amount before it counts as off. Keep it
              small but non-zero to absorb gas dust and rounding.
            </p>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Native asset</span>
                <div className="input-wrap">
                  <input
                    className="input mono"
                    value={nativeDraft}
                    onChange={(e) => {
                      setNativeDraft(e.target.value)
                      setToleranceError(null)
                    }}
                    onBlur={commitTolerances}
                    inputMode="decimal"
                  />
                  <span className="input-suffix">±</span>
                </div>
              </label>
              <label className="field">
                <span className="field-label">ERC-20 units</span>
                <div className="input-wrap">
                  <input
                    className="input mono"
                    value={tokenDraft}
                    onChange={(e) => {
                      setTokenDraft(e.target.value)
                      setToleranceError(null)
                    }}
                    onBlur={commitTolerances}
                    inputMode="decimal"
                  />
                  <span className="input-suffix">±</span>
                </div>
              </label>
            </div>
            {toleranceError && (
              <p className="field-error" role="alert">
                <Icon name="alert" size={13} /> {toleranceError}
              </p>
            )}
          </section>

          <section className="settings-group">
            <h3>Auto-refresh</h3>
            <p className="settings-hint">
              Balances are read straight from each network by your browser.
            </p>
            <select
              className="input"
              value={settings.autoRefreshSeconds}
              onChange={(e) => onChange({ autoRefreshSeconds: Number(e.target.value) })}
            >
              {refreshOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </section>

          <section className="settings-group">
            <h3>Browser notifications</h3>
            <p className="settings-hint">
              Get a desktop alert the moment a watched balance stops matching.
            </p>
            <label className="switch-row">
              <input
                type="checkbox"
                className="switch"
                checked={settings.notifications}
                disabled={permission === 'unsupported' || permission === 'denied'}
                onChange={(e) => void toggleNotifications(e.target.checked)}
              />
              <span>
                {permission === 'unsupported'
                  ? 'Not supported in this browser'
                  : permission === 'denied'
                    ? 'Blocked in browser settings'
                    : settings.notifications
                      ? 'Notifications on'
                      : 'Enable notifications'}
              </span>
            </label>
          </section>

          <section className="settings-group">
            <h3>RPC endpoints</h3>
            <p className="settings-hint">
              Leave a field empty to use the built-in public pool for that network. Point it at your
              own node for full privacy.
            </p>
            <div className="rpc-list">
              {NETWORK_LIST.map((network) => (
                <label className="rpc-row" key={network.id}>
                  <span className="rpc-name">
                    <i style={{ background: network.accent }} aria-hidden="true" />
                    {network.name}
                    {network.testnet && <span className="rpc-tag">testnet</span>}
                  </span>
                  <input
                    className="input input-compact mono"
                    value={settings.customRpcs[network.id] ?? ''}
                    placeholder={`default · ${network.nativeSymbol}`}
                    spellCheck={false}
                    onChange={(e) => setRpc(network.id, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => onChange({ customRpcs: {} })}
              disabled={Object.values(settings.customRpcs).every((value) => !value)}
            >
              Reset all to default endpoints
            </button>
          </section>

          <section className="settings-group">
            <h3>Your data</h3>
            <p className="settings-hint">
              Everything is stored in this browser only. {walletCount} wallet
              {walletCount === 1 ? '' : 's'} saved.
            </p>
            <div className="settings-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onExport}>
                <Icon name="download" size={14} /> Export
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileRef.current?.click()}
              >
                <Icon name="upload" size={14} /> Import
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </div>
            {importMessage && <p className="settings-note">{importMessage}</p>}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-danger btn-block"
              onClick={() => {
                if (window.confirm('Delete every wallet and alert stored in this browser?')) {
                  onClearData()
                  setImportMessage(null)
                }
              }}
            >
              <Icon name="trash" size={14} /> Delete all local data
            </button>
          </section>

          <section className="settings-group settings-security">
            <Icon name="shield" size={14} /> This app never asks for, stores or transmits a private
            key or seed phrase. Addresses are read-only, so nothing here can move funds.
          </section>
        </div>
      </aside>
    </div>
  )
}
