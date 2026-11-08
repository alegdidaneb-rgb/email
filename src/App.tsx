import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertLog } from './components/AlertLog'
import { Icon } from './components/Icon'
import { SettingsPanel } from './components/SettingsPanel'
import { WalletCard } from './components/WalletCard'
import { WalletForm } from './components/WalletForm'
import {
  assetGap,
  combineStatus,
  evaluateStatus,
  fetchNativeBalance,
  fetchTokenBalance,
  fetchTokenMeta,
  makeClient,
  normalizeAddress,
  normalizeAmount,
} from './lib/eth'
import { formatCompact, relativeTime, shortenAddress, uid } from './lib/format'
import { networkOf, NETWORK_LIST } from './lib/networks'
import { capAlerts, capHistory, emptyDb, loadDb, parseDb, saveDb } from './lib/storage'
import type {
  AlertEntry,
  AssetStatus,
  DB,
  NetworkId,
  NewWalletInput,
  Settings,
  TokenHolding,
  Wallet,
} from './lib/types'

type Filter = 'all' | 'off'
type NetworkFilter = 'all' | NetworkId

interface Job {
  walletId: string
  tokenId: string | null
  promise: Promise<string>
}

const jobKey = (walletId: string, tokenId: string | null) => `${walletId}:${tokenId ?? 'native'}`

export default function App() {
  const [db, setDb] = useState<DB>(() => loadDb())
  const dbRef = useRef(db)
  const [checkingIds, setCheckingIds] = useState<string[]>([])
  const [rpcError, setRpcError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all')
  const [, setTick] = useState(0)

  const commit = useCallback((updater: (prev: DB) => DB) => {
    const next = updater(dbRef.current)
    dbRef.current = next
    setDb(next)
  }, [])

  useEffect(() => {
    saveDb(db)
  }, [db])

  // Keeps "checked 2m ago" labels honest without hitting the chain.
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
          body: `${networkOf(alert.network).short} · ${alert.message}`,
          tag: `${alert.walletId}-${alert.at}`,
        })
      } catch {
        /* best effort */
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

      const clients = new Map<NetworkId, ReturnType<typeof makeClient>>()
      const clientFor = (network: NetworkId) => {
        let client = clients.get(network)
        if (!client) {
          client = makeClient(network, snapshot.settings.customRpcs[network] ?? '')
          clients.set(network, client)
        }
        return client
      }

      const jobs: Job[] = []
      for (const wallet of targets) {
        const client = clientFor(wallet.network)
        jobs.push({
          walletId: wallet.id,
          tokenId: null,
          promise: fetchNativeBalance(client, wallet.address),
        })
        for (const token of wallet.tokens) {
          jobs.push({
            walletId: wallet.id,
            tokenId: token.id,
            promise: fetchTokenBalance(client, token.tokenAddress, wallet.address, token.decimals),
          })
        }
      }

      const settled = await Promise.allSettled(jobs.map((job) => job.promise))
      const values = new Map<string, string>()
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          values.set(jobKey(jobs[index].walletId, jobs[index].tokenId), result.value)
        }
      })

      if (values.size === 0) {
        setRpcError(
          'No RPC endpoint answered for these networks. Check your connection, or set your own endpoint under Settings.',
        )
        setCheckingIds([])
        return
      }

      const failed = jobs.length - values.size
      if (failed > 0) {
        setRpcError(
          `${failed} balance${failed === 1 ? '' : 's'} could not be read just now — retrying on the next check.`,
        )
      }

      const now = Date.now()
      const targetIds = new Set(targets.map((target) => target.id))
      const freshAlerts: AlertEntry[] = []

      commit((prev) => {
        const tolNative = Number(prev.settings.toleranceNative) || 0
        const tolToken = Number(prev.settings.toleranceToken) || 0

        const wallets = prev.wallets.map((wallet) => {
          if (!targetIds.has(wallet.id)) return wallet
          const symbol = networkOf(wallet.network).nativeSymbol
          let next = wallet

          const nativeValue = values.get(jobKey(wallet.id, null))
          if (nativeValue !== undefined) {
            const status = evaluateStatus(nativeValue, wallet.expectedNative, tolNative)
            const alert = transitionAlert(
              wallet,
              symbol,
              wallet.status,
              status,
              wallet.expectedNative,
              nativeValue,
              now,
            )
            if (alert) freshAlerts.push(alert)

            const last = wallet.history[wallet.history.length - 1]
            const history =
              last && last.amount === nativeValue
                ? wallet.history
                : capHistory([...wallet.history, { t: now, amount: nativeValue }])

            next = { ...next, lastNative: nativeValue, lastCheckedAt: now, status, history }
          }

          if (wallet.tokens.length > 0) {
            next = {
              ...next,
              tokens: wallet.tokens.map((token) => {
                const value = values.get(jobKey(wallet.id, token.id))
                if (value === undefined) return token
                const status = evaluateStatus(value, token.expectedAmount, tolToken)
                const alert = transitionAlert(
                  wallet,
                  token.symbol,
                  token.status,
                  status,
                  token.expectedAmount,
                  value,
                  now,
                )
                if (alert) freshAlerts.push(alert)
                return { ...token, lastAmount: value, status, lastCheckedAt: now }
              }),
            }
          }

          return next
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
      network: input.network,
      label: input.label,
      note: input.note,
      createdAt: Date.now(),
      expectedNative: input.expectedNative,
      lastNative: null,
      lastCheckedAt: null,
      status: 'unknown',
      history: [],
      tokens: [],
    }
    commit((prev) => ({ ...prev, wallets: [wallet, ...prev.wallets] }))
    void refresh([wallet.id])
  }

  const updateWallet = (id: string, patch: Partial<Wallet>) => {
    commit((prev) => {
      const tolerance = Number(prev.settings.toleranceNative) || 0
      return {
        ...prev,
        wallets: prev.wallets.map((wallet) => {
          if (wallet.id !== id) return wallet
          const next = { ...wallet, ...patch }
          return { ...next, status: evaluateStatus(next.lastNative, next.expectedNative, tolerance) }
        }),
      }
    })
  }

  const removeWallet = (wallet: Wallet) => {
    if (!window.confirm(`Remove "${wallet.label}" and its token holdings from your watchlist?`)) return
    commit((prev) => ({
      ...prev,
      wallets: prev.wallets.filter((item) => item.id !== wallet.id),
      alerts: prev.alerts.filter((alert) => alert.walletId !== wallet.id),
    }))
  }

  const reconcileNative = (wallet: Wallet) => {
    const lastNative = wallet.lastNative
    if (lastNative === null) return
    updateWallet(wallet.id, { expectedNative: lastNative })
    const symbol = networkOf(wallet.network).nativeSymbol
    commit((prev) => ({
      ...prev,
      alerts: capAlerts([
        makeAlert(wallet, symbol, 'back-in-line', 'Assigned amount updated to the current balance', lastNative, lastNative, Date.now()),
        ...prev.alerts,
      ]),
    }))
  }

  const addToken = async (
    walletId: string,
    tokenAddressInput: string,
    expectedAmountInput: string,
  ): Promise<string | null> => {
    const wallet = dbRef.current.wallets.find((item) => item.id === walletId)
    if (!wallet) return 'That wallet is no longer on your watchlist.'

    const parsedAddress = normalizeAddress(tokenAddressInput)
    if (!parsedAddress.ok) return parsedAddress.error
    if (
      wallet.tokens.some(
        (token) => token.tokenAddress.toLowerCase() === parsedAddress.address.toLowerCase(),
      )
    ) {
      return 'That token is already tracked on this wallet.'
    }
    const parsedAmount = normalizeAmount(expectedAmountInput)
    if (!parsedAmount.ok) return parsedAmount.error

    const client = makeClient(
      wallet.network,
      dbRef.current.settings.customRpcs[wallet.network] ?? '',
    )

    let meta
    try {
      meta = await fetchTokenMeta(client, parsedAddress.address)
    } catch {
      return `Could not read that contract on ${networkOf(wallet.network).name}. Check the address and network.`
    }

    const token: TokenHolding = {
      id: uid(),
      tokenAddress: parsedAddress.address,
      symbol: meta.symbol || shortenAddress(parsedAddress.address, 4, 4),
      decimals: meta.decimals,
      expectedAmount: parsedAmount.amount,
      lastAmount: null,
      lastCheckedAt: null,
      status: 'unknown',
    }

    commit((prev) => ({
      ...prev,
      wallets: prev.wallets.map((item) =>
        item.id === walletId ? { ...item, tokens: [...item.tokens, token] } : item,
      ),
    }))
    void refresh([walletId])
    return null
  }

  const updateToken = (walletId: string, tokenId: string, patch: Partial<TokenHolding>) => {
    commit((prev) => {
      const tolerance = Number(prev.settings.toleranceToken) || 0
      return {
        ...prev,
        wallets: prev.wallets.map((wallet) =>
          wallet.id === walletId
            ? {
                ...wallet,
                tokens: wallet.tokens.map((token) => {
                  if (token.id !== tokenId) return token
                  const next = { ...token, ...patch }
                  return {
                    ...next,
                    status: evaluateStatus(next.lastAmount, next.expectedAmount, tolerance),
                  }
                }),
              }
            : wallet,
        ),
      }
    })
  }

  const removeToken = (walletId: string, tokenId: string) => {
    commit((prev) => ({
      ...prev,
      wallets: prev.wallets.map((wallet) =>
        wallet.id === walletId
          ? { ...wallet, tokens: wallet.tokens.filter((token) => token.id !== tokenId) }
          : wallet,
      ),
    }))
  }

  const reconcileToken = (wallet: Wallet, token: TokenHolding) => {
    const lastAmount = token.lastAmount
    if (lastAmount === null) return
    updateToken(wallet.id, token.id, { expectedAmount: lastAmount })
    commit((prev) => ({
      ...prev,
      alerts: capAlerts([
        makeAlert(wallet, token.symbol, 'back-in-line', 'Assigned amount updated to the current balance', lastAmount, lastAmount, Date.now()),
        ...prev.alerts,
      ]),
    }))
  }

  const updateSettings = (patch: Partial<Settings>) => {
    commit((prev) => {
      const settings = { ...prev.settings, ...patch }
      const tolNative = Number(settings.toleranceNative) || 0
      const tolToken = Number(settings.toleranceToken) || 0
      return {
        ...prev,
        settings,
        wallets: prev.wallets.map((wallet) => ({
          ...wallet,
          status: evaluateStatus(wallet.lastNative, wallet.expectedNative, tolNative),
          tokens: wallet.tokens.map((token) => ({
            ...token,
            status: evaluateStatus(token.lastAmount, token.expectedAmount, tolToken),
          })),
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

  const stats = useMemo(() => {
    const networks = new Set<NetworkId>()
    let assets = 0
    let nativeCount = 0
    let tokenCount = 0
    let offAssets = 0
    let offWallets = 0
    let lastCheck: number | null = null

    for (const wallet of db.wallets) {
      networks.add(wallet.network)
      assets += 1 + wallet.tokens.length
      nativeCount += 1
      tokenCount += wallet.tokens.length
      if (wallet.status === 'below' || wallet.status === 'above') offAssets += 1
      for (const token of wallet.tokens) {
        if (token.status === 'below' || token.status === 'above') offAssets += 1
      }
      const overall = combineStatus([wallet.status, ...wallet.tokens.map((token) => token.status)])
      if (overall === 'below' || overall === 'above') offWallets += 1
      if (wallet.lastCheckedAt && (!lastCheck || wallet.lastCheckedAt > lastCheck)) {
        lastCheck = wallet.lastCheckedAt
      }
    }

    return { networks, assets, nativeCount, tokenCount, offAssets, offWallets, lastCheck }
  }, [db.wallets])

  const visibleWallets = useMemo(
    () =>
      db.wallets.filter((wallet) => {
        if (networkFilter !== 'all' && wallet.network !== networkFilter) return false
        if (filter === 'off') {
          const overall = combineStatus([
            wallet.status,
            ...wallet.tokens.map((token) => token.status),
          ])
          return overall === 'below' || overall === 'above'
        }
        return true
      }),
    [db.wallets, filter, networkFilter],
  )

  const availableNetworks = useMemo(
    () =>
      NETWORK_LIST.filter((network) =>
        db.wallets.some((wallet) => wallet.network === network.id),
      ),
    [db.wallets],
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
            <p>Watch-only wallets across Ethereum and L2s, each with an amount you assign</p>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="network-pill">
            <i aria-hidden="true" />
            {stats.networks.size === 0
              ? 'Mainnet + L2s'
              : stats.networks.size === 1
                ? networkOf([...stats.networks][0]).name
                : `${stats.networks.size} networks`}
          </span>
          <span className="topbar-time">
            <Icon name="clock" size={13} />
            {stats.lastCheck ? `checked ${relativeTime(stats.lastCheck)}` : 'not checked yet'}
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
          <span className="stat-label">Assets tracked</span>
          <span className="stat-value mono">{stats.assets}</span>
          <span className="stat-sub">
            {stats.nativeCount} native · {stats.tokenCount} ERC-20
          </span>
        </div>
        <div className={`stat ${stats.offAssets > 0 ? 'is-off' : ''}`}>
          <span className="stat-label">Off assigned amount</span>
          <span className="stat-value mono">{stats.offAssets}</span>
          <span className="stat-sub">
            {stats.offAssets === 0
              ? 'everything in line'
              : `across ${stats.offWallets} wallet${stats.offWallets === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Networks in use</span>
          <span className="stat-value mono">{stats.networks.size}</span>
          <span className="stat-sub">
            auto-refresh{' '}
            {db.settings.autoRefreshSeconds ? `every ${db.settings.autoRefreshSeconds}s` : 'off'}
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
                Off assigned <span className="tab-count">{stats.offWallets}</span>
              </button>
            </div>

            {availableNetworks.length > 1 && (
              <label className="network-filter">
                <Icon name="globe" size={13} />
                <select
                  className="input input-compact"
                  value={networkFilter}
                  onChange={(e) => setNetworkFilter(e.target.value as NetworkFilter)}
                  aria-label="Filter by network"
                >
                  <option value="all">All networks</option>
                  {availableNetworks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {db.wallets.length === 0 ? (
            <div className="empty">
              <span className="empty-mark" aria-hidden="true">
                <Icon name="target" size={26} />
              </span>
              <h2>Add your first watch-only wallet</h2>
              <p>
                Paste the address of a hardware wallet, exchange deposit or any cold wallet on
                Ethereum, Base, Arbitrum, OP Mainnet or Polygon, then give it the amount it should
                hold. Balances are read live and flagged the moment they no longer match.
              </p>
              <ul className="empty-points">
                <li>
                  <Icon name="check" size={13} /> Never asks for a private key or seed phrase
                </li>
                <li>
                  <Icon name="check" size={13} /> ETH and ERC-20 tracking, each with its own amount
                </li>
                <li>
                  <Icon name="check" size={13} /> Everything stays in this browser
                </li>
              </ul>
            </div>
          ) : visibleWallets.length === 0 ? (
            <div className="empty empty-small">
              <h2>
                {filter === 'off'
                  ? 'Nothing off its assigned amount'
                  : 'No wallets on this network yet'}
              </h2>
              <p>
                {filter === 'off'
                  ? 'Every watched asset currently matches the amount you set. Nice.'
                  : 'Switch the network filter to see the rest of your watchlist.'}
              </p>
            </div>
          ) : (
            <div className="wallet-list">
              {visibleWallets.map((wallet) => (
                <WalletCard
                  key={wallet.id}
                  wallet={wallet}
                  toleranceNative={Number(db.settings.toleranceNative) || 0}
                  checking={checkingIds.includes(wallet.id)}
                  onRefresh={() => void refresh([wallet.id])}
                  onUpdate={(patch) => updateWallet(wallet.id, patch)}
                  onRemove={() => removeWallet(wallet)}
                  onReconcileNative={() => reconcileNative(wallet)}
                  onAddToken={(tokenAddress, amount) => addToken(wallet.id, tokenAddress, amount)}
                  onUpdateToken={(tokenId, patch) => updateToken(wallet.id, tokenId, patch)}
                  onRemoveToken={(tokenId) => removeToken(wallet.id, tokenId)}
                  onReconcileToken={(token) => reconcileToken(wallet, token)}
                />
              ))}
            </div>
          )}
        </main>

        <aside className="side-column">
          <WalletForm
            known={db.wallets.map((wallet) => ({ address: wallet.address, network: wallet.network }))}
            onAdd={addWallet}
          />
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

function transitionAlert(
  wallet: Wallet,
  asset: string,
  previous: AssetStatus,
  next: AssetStatus,
  expected: string,
  actual: string | null,
  now: number,
): AlertEntry | null {
  if (next === previous) return null
  const gap = formatCompact(assetGap(actual, expected))
  const known = previous !== 'unknown'

  if (known && next === 'below') {
    return makeAlert(wallet, asset, 'moved-down', `${gap} ${asset} under the assigned amount — funds moved out`, expected, actual, now)
  }
  if (known && next === 'above') {
    return makeAlert(wallet, asset, 'moved-up', `${gap} ${asset} over the assigned amount — funds moved in`, expected, actual, now)
  }
  if (known && next === 'match') {
    return makeAlert(wallet, asset, 'back-in-line', `${asset} is back at the assigned amount`, expected, actual, now)
  }
  if (next === 'below' || next === 'above') {
    return makeAlert(
      wallet,
      asset,
      'mismatch',
      `First reading is ${gap} ${asset} ${next === 'below' ? 'under' : 'over'} the assigned amount`,
      expected,
      actual,
      now,
    )
  }
  return null
}

function makeAlert(
  wallet: Wallet,
  asset: string,
  kind: AlertEntry['kind'],
  message: string,
  expected: string,
  actual: string | null,
  at: number,
): AlertEntry {
  return {
    id: uid(),
    walletId: wallet.id,
    label: wallet.label,
    address: wallet.address,
    network: wallet.network,
    asset,
    kind,
    message,
    expected,
    actual,
    at,
  }
}
