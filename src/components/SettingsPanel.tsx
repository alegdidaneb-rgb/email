import { useEffect, useRef, useState } from 'react'
import { normalizeAmount } from '../lib/eth'
import { DEFAULT_SETTINGS } from '../lib/storage'
import type { Settings } from '../lib/types'
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
  const [toleranceDraft, setToleranceDraft] = useState(settings.toleranceEth)
  const [toleranceError, setToleranceError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setToleranceDraft(settings.toleranceEth)
  }, [settings.toleranceEth])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function commitTolerance() {
    const parsed = normalizeAmount(toleranceDraft)
    if (!parsed.ok) {
      setToleranceError(parsed.error)
      return
    }
    setToleranceError(null)
    onChange({ toleranceEth: parsed.amount })
  }

  async function toggleNotifications(next: boolean) {
    if (!next) {
      onChange({ notifications: false })
      return
    }
    if (typeof Notification === 'undefined') return
    const result =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission()
    setPermission(result)
    onChange({ notifications: result === 'granted' })
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
              How far a balance may drift from its assigned amount before it is flagged. Use a
              small positive number to ignore rounding and gas dust.
            </p>
            <div className="input-wrap">
              <input
                className="input mono"
                value={toleranceDraft}
                onChange={(e) => {
                  setToleranceDraft(e.target.value)
                  setToleranceError(null)
                }}
                onBlur={commitTolerance}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTolerance()
                }}
                inputMode="decimal"
              />
              <span className="input-suffix">± ETH</span>
            </div>
            {toleranceError && (
              <p className="field-error" role="alert">
                <Icon name="alert" size={13} /> {toleranceError}
              </p>
            )}
          </section>

          <section className="settings-group">
            <h3>Auto-refresh</h3>
            <p className="settings-hint">Balances are read straight from Ethereum mainnet.</p>
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
            <h3>RPC endpoint</h3>
            <p className="settings-hint">
              Leave empty to use the built-in public endpoint pool. Point this at your own node
              (e.g. <span className="mono">http://localhost:8545</span>) for full privacy.
            </p>
            <input
              className="input mono"
              value={settings.rpcUrl}
              placeholder="https://…"
              spellCheck={false}
              onChange={(e) => onChange({ rpcUrl: e.target.value })}
            />
            {settings.rpcUrl && (
              <button
                type="button"
                className="link-btn"
                onClick={() => onChange({ rpcUrl: DEFAULT_SETTINGS.rpcUrl })}
              >
                Reset to default endpoints
              </button>
            )}
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

          <section className="settings-group settings-note">
            <Icon name="shield" size={14} /> This app never asks for, stores or transmits a private
            key or seed phrase. Addresses are read-only, so nothing here can move funds.
          </section>
        </div>
      </aside>
    </div>
  )
}
