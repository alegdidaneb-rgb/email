import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertLog } from './components/AlertLog'
import { Icon } from './components/Icon'
import { SettingsPanel } from './components/SettingsPanel'
import { WalletCard } from './components/WalletCard'
import { WalletForm } from './components/WalletForm'
import { evaluateStatus, fetchEthBalance, makeClient } from './lib/eth'
import { formatEth, formatEthCompact, relativeTime, uid } from './lib/format'
import { capAlerts, capHistory, emptyDb, loadDb, parseDb, saveDb } from './lib/storage'
import type { AlertEntry, DB, NewWalletInput, Settings, Wallet } from './lib/types'

type Filter = 'all' | 'off'

export default function App() {
  const [db, setDb] = useState<DB>(() => loadDb())
  const dbRef = useRef(db)
  const [checkingIds, setCheckingIds] = useState<string[]>([])
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [, setTick] = useState(0)

  const commit = useCallback((updater: (prev: DB) => DB) => {
    const next = updater(dbRef.current)
    dbRef.current = next
    setDb(next)
  }, [])

  useEffect(() => {
    saveDb(db)
  }, [db])

  // Keeps "checked 2m ago" style labels honest without re-reading the chain.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])

  const notify = useCallback((alerts: AlertEntry[]) => {
    if (!dbRef.current.settings.notifications) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const alert of alerts) {
      if (alert.kind !== 'moved-down' && alert.kind !== 'moved-up') continue
      try {
        new Notification(`WatchVault · ${alert.label}`, {
          body: alert.message,
          tag: `${alert.walletId}-${alert.at}`,
        })
      } catch {
        /* notifications are best-effort */
      }
    }
  }, [])

  const refresh = useCallback(
    async (ids?: string[]) => {
      const snapshot = dbRef.current
      const targets = ids
        ? snapshot.wallets.filter((wallet) => ids.includes(wallet.id))
        : snapshot.wallets
      if (targets.length === 0) return

      setCheckingIds(targets.map((target) => target.id))
      setRpcError(null)

      const client = makeClient(snapshot.settings.rpcUrl)
      const results = await Promise.allSettled(
        targets.map((target) => fetchEthBalance(client, target.address)),
      )

      const balances = new Map<string, string>()
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') balances.set(targets[index].id, result.value)
      })

      if (balances.size === 0) {
        setRpcError(
          'No Ethereum RPC endpoint answered. Check your connection, or set your own endpoint in Settings.',
        )
        setCheckingIds([])
        return
      }

      const failed = targets.length - balances.size
      if (failed > 0) {
        setRpcError(
          `${failed} address${failed === 1 ? '' : 'es'} could not be read just now — retrying on the next check.`,
        )
      }

      const now = Date.now()
      const tolerance = Number(snapshot.settings.toleranceEth) || 0
      const freshAlerts: AlertEntry[] = []

      commit((prev) => {
        const wallets = prev.wallets.map((wallet) => {
          const actualEth = balances.get(wallet.id)
          if (actualEth === undefined) return wallet

          const { status } = evaluateStatus(actualEth, wallet.expectedEth, tolerance)
          const expected = Number(wallet.expectedEth)
          const actual = Number(actualEth)
          const gap = formatEthCompact(Math.abs(actual - expected))
          const known = wallet.lastEth !== null && wallet.status !== 'unknown'

          if (status !== wallet.status) {
            if (known && status === 'below') {
              freshAlerts.push(
                makeAlert(wallet, 'moved-down', `${gap} ETH under the assigned amount — funds moved out`, actualEth, now),
              )
            } else if (known && status === 'above') {
              freshAlerts.push(
                makeAlert(wallet, 'moved-up', `${gap} ETH over the assigned amount — funds moved in`, actualEth, now),
              )
            } else if (known && status === 'match') {
              freshAlerts.push(
                makeAlert(wallet, 'back-in-line', 'Balance is back at the assigned amount', actualEth, now),
              )
            } else if (status === 'below' || status === 'above') {
              freshAlerts.push(
                makeAlert(
                  wallet,
                  'mismatch',
                  `First reading is ${gap} ETH ${status === 'below' ? 'under' : 'over'} the assigned amount`,
                  actualEth,
                  now,
                ),
              )
            }
          }

          const lastSnapshot = wallet.history[wallet.history.length - 1]
          const history =
            lastSnapshot && lastSnapshot.eth === actualEth
              ? wallet.history
              : capHistory([...wallet.history, { t: now, eth: actualEth }])

          return {
            ...wallet,
            lastEth: actualEth,
            lastCheckedAt: now,
            status,
            history,
          }
        })

        return { ...prev, wallets }
      })

      if (freshAlerts.length > 0) {
        commit((prev) => ({ ...prev, alerts: capAlerts([...freshAlerts, ...prev.alerts]) }))
        notify(freshAlerts)
      }

      setCheckingIds([])
    },
    [commit, notify],
  )

  // One check on load, then on the configured interval.
  const didInitialCheck = useRef(false)
  useEffect(() => {
    if (didInitialCheck.current) return
    didInitialCheck.current = true
    if (dbRef.current.wallets.length > 0) void refresh()
  }, [refresh])

  useEffect(() => {
    const seconds = db.settings.autoRefreshSeconds
    if (!seconds) return
    const id = window.setInterval(() => void refresh(), seconds * 1000)
    return () => window.clearInterval(id)
  }, [db.settings.autoRefreshSeconds, refresh])

  const addWallet = (input: NewWalletInput) => {
    const wallet: Wallet = {
      id: uid(),
      address: input.address,
      label: input.label,
      expectedEth: input.expectedEth,
      note: input.note,
      createdAt: Date.now(),
      lastEth: null,
      lastCheckedAt: null,
      status: 'unknown',
      history: [],
    }
    commit((prev) => ({ ...prev, wallets: [wallet, ...prev.wallets] }))
    void refresh([wallet.id])
  }

  const updateWallet = (id: string, patch: Partial<Wallet>) => {
    commit((prev) => {
      const tolerance = Number(prev.settings.toleranceEth) || 0
      return {
        ...prev,
        wallets: prev.wallets.map((wallet) => {
          if (wallet.id !== id) return wallet
          const next = { ...wallet, ...patch }
          return {
            ...next,
            status: evaluateStatus(next.lastEth, next.expectedEth, tolerance).status,
          }
        }),
      }
    })
  }

  const removeWallet = (wallet: Wallet) => {
    if (!window.confirm(`Remove "${wallet.label}" from your watchlist?`)) return
    commit((prev) => ({
      ...prev,
      wallets: prev.wallets.filter((item) => item.id !== wallet.id),
      alerts: prev.alerts.filter((alert) => alert.walletId !== wallet.id),
    }))
  }

  const reconcile = (wallet: Wallet) => {
    if (wallet.lastEth === null) return
    updateWallet(wallet.id, { expectedEth: wallet.lastEth })
    commit((prev) => ({
      ...prev,
      alerts: capAlerts([
        makeAlert(
          wallet,
          'back-in-line',
          `Assigned amount updated to the current balance (${formatEth(wallet.lastEth, 6)} ETH)`,
          wallet.lastEth,
          Date.now(),
        ),
        ...prev.alerts,
      ]),
    }))
  }

  const updateSettings = (patch: Partial<Settings>) => {
    commit((prev) => {
      const settings = { ...prev.settings, ...patch }
      const tolerance = Number(settings.toleranceEth) || 0
      return {
        ...prev,
        settings,
        wallets: prev.wallets.map((wallet) => ({
          ...wallet,
          status: evaluateStatus(wallet.lastEth, wallet.expectedEth, tolerance).status,
        })),
      }
    })
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(dbRef.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `watchvault-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importData = (json: string): string | null => {
    try {
      const next = parseDb(JSON.parse(json))
      if (next.wallets.length === 0) return 'That file contains no wallets.'
      commit(() => next)
      void refresh()
      return null
    } catch {
      return 'That file is not valid WatchVault JSON.'
    }
  }

  const totals = useMemo(() => {
    let expected = 0
    let actual = 0
    let counted = 0
    let off = 0
    for (const wallet of db.wallets) {
      expected += Number(wallet.expectedEth) || 0
      if (wallet.lastEth !== null) {
        actual += Number(wallet.lastEth) || 0
        counted += 1
      }
      if (wallet.status === 'below' || wallet.status === 'above') off += 1
    }
    const complete = counted === db.wallets.length && db.wallets.length > 0
    return { expected, actual, counted, off, drift: complete ? actual - expected : null }
  }, [db.wallets])

  const visibleWallets = useMemo(
    () =>
      filter === 'off'
        ? db.wallets.filter((wallet) => wallet.status === 'below' || wallet.status === 'above')
        : db.wallets,
    [db.wallets, filter],
  )

  const checking = checkingIds.length > 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="shield" size={18} />
          </span>
          <div className="brand-text">
            <h1>WatchVault</h1>
            <p>Watch-only Ethereum wallets, each with an amount you assign</p>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="network-pill">
            <i aria-hidden="true" /> Ethereum mainnet
          </span>
          <span className="topbar-time">
            <Icon name="clock" size={13} />
            {lastCheckedLabel(db.wallets)}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void refresh()}
            disabled={checking || db.wallets.length === 0}
          >
            <Icon name="refresh" size={14} className={checking ? 'spin' : undefined} />
            {checking ? 'Checking…' : 'Check now'}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-lg"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title="Settings"
          >
            <Icon name="settings" size={17} />
          </button>
        </div>
      </header>

      {rpcError && (
        <div className="banner banner-warn" role="status">
          <Icon name="alert" size={15} />
          <span>{rpcError}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRpcError(null)}
            aria-label="Dismiss"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Wallets watched</span>
          <span className="stat-value mono">{db.wallets.length}</span>
          <span className="stat-sub">
            <Icon name="shield" size={11} /> read-only, no keys stored
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Assigned total</span>
          <span className="stat-value mono">
            {formatEth(totals.expected, 4)} <em>ETH</em>
          </span>
          <span className="stat-sub">sum of the amounts you set</span>
        </div>
        <div className="stat">
          <span className="stat-label">On-chain total</span>
          <span className="stat-value mono">
            {formatEth(totals.counted ? totals.actual : null, 4)} <em>ETH</em>
          </span>
          <span className="stat-sub">
            {totals.counted} of {db.wallets.length} read live
          </span>
        </div>
        <div className={`stat ${totals.off > 0 ? 'is-off' : ''}`}>
          <span className="stat-label">Off assigned amount</span>
          <span className="stat-value mono">{totals.off}</span>
          <span className="stat-sub">
            {totals.drift === null
              ? 'waiting for a full reading'
              : totals.drift === 0
                ? 'everything in line'
                : `${formatEthCompact(Math.abs(totals.drift))} ETH ${totals.drift < 0 ? 'short' : 'extra'}`}
          </span>
        </div>
      </section>

      <div className="layout">
        <main className="list-column">
          <div className="list-head">
            <div className="tabs" role="tablist" aria-label="Filter wallets">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={`tab ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All <span className="tab-count">{db.wallets.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'off'}
                className={`tab ${filter === 'off' ? 'is-active' : ''}`}
                onClick={() => setFilter('off')}
              >
                Off assigned <span className="tab-count">{totals.off}</span>
              </button>
            </div>
            <span className="list-updated">
              auto-refresh{' '}
              {db.settings.autoRefreshSeconds
                ? `every ${db.settings.autoRefreshSeconds}s`
                : 'off'}
            </span>
          </div>

          {db.wallets.length === 0 ? (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">
                <Icon name="target" size={26} />
              </span>
              <h2>Add your first watch-only wallet</h2>
              <p>
                Paste the address of a hardware wallet, exchange deposit address or any cold wallet
                and give it the amount it should hold. WatchVault reads the real balance from
                Ethereum and flags the moment it no longer matches.
              </p>
              <ul className="empty-points">
                <li>
                  <Icon name="check" size={13} /> Never asks for a private key or seed phrase
                </li>
                <li>
                  <Icon name="check" size={13} /> Reads balances straight from mainnet
                </li>
                <li>
                  <Icon name="check" size={13} /> Everything stays in this browser
                </li>
              </ul>
            </div>
          ) : visibleWallets.length === 0 ? (
            <div className="empty empty-small">
              <h2>Nothing off its assigned amount</h2>
              <p>Every watched wallet currently matches the amount you set. Nice.</p>
            </div>
          ) : (
            <div className="wallet-list">
              {visibleWallets.map((wallet) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  toleranceEth={Number(db.settings.toleranceEth) || 0}
                  checking={checkingIds.includes(wallet.id)}
                  onRefresh={() => void refresh([wallet.id])}
                  onUpdate={(patch) => updateWallet(wallet.id, patch)}
                  onRemove={() => removeWallet(wallet)}
                  onReconcile={() => reconcile(wallet)}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="side-column">
          <WalletForm knownAddresses={db.wallets.map((wallet) => wallet.address)} onAdd={addWallet} />
          <AlertLog alerts={db.alerts} onClear={() => commit((prev) => ({ ...prev, alerts: [] }))} />
          <p className="side-note">
            <Icon name="shield" size={13} /> WatchVault can only read. It cannot sign, send or move
            anything — that is what makes it safe.
          </p>
        </aside>
      </div>

      <SettingsPanel
        open={settingsOpen}
        settings={db.settings}
        walletCount={db.wallets.length}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        onExport={exportData}
        onImport={importData}
        onClearData={() => {
          commit(() => emptyDb())
          setRpcError(null)
        }}
      />
    </div>
  )
}

function makeAlert(
  wallet: Wallet,
  kind: AlertEntry['kind'],
  message: string,
  actualEth: string | null,
  at: number,
): AlertEntry {
  return {
    id: uid(),
    walletId: wallet.id,
    label: wallet.label,
    address: wallet.address,
    kind,
    message,
    expectedEth: wallet.expectedEth,
    actualEth,
    at,
  }
}

function lastCheckedLabel(wallets: Wallet[]): string {
  const stamps = wallets
    .map((wallet) => wallet.lastCheckedAt)
    .filter((stamp): stamp is number => typeof stamp === 'number')
  if (stamps.length === 0) return wallets.length ? 'not checked yet' : 'idle'
  return `checked ${relativeTime(Math.max(...stamps))}`
}
