import { formatClock, shortenAddress } from '../lib/format'
import { networkOf } from '../lib/networks'
import type { AlertEntry } from '../lib/types'
import { Icon, type IconName } from './Icon'

interface Props {
  alerts: AlertEntry[]
  onClear: () => void
}

const kindMeta: Record<AlertEntry['kind'], { icon: IconName; className: string }> = {
  'moved-down': { icon: 'alert', className: 'is-below' },
  'moved-up': { icon: 'download', className: 'is-above' },
  'back-in-line': { icon: 'check', className: 'is-match' },
  mismatch: { icon: 'target', className: 'is-unknown' },
  error: { icon: 'alert', className: 'is-below' },
}

export function AlertLog({ alerts, onClear }: Props) {
  return (
    <section className="card alerts-card">
      <div className="card-head">
        <h2>
          <Icon name="bell" size={15} /> Activity
        </h2>
        {alerts.length > 0 && (
          <button type="button" className="link-btn" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      {alerts.length === 0 ? (
        <p className="card-sub">
          When a watched balance stops matching its assigned amount, it shows up here.
        </p>
      ) : (
        <ul className="alert-list">
          {alerts.slice(0, 25).map((alert) => {
            const meta = kindMeta[alert.kind]
            return (
              <li key={alert.id} className={`alert-item ${meta.className}`}>
                <span className="alert-icon">
                  <Icon name={meta.icon} size={13} />
                </span>
                <div className="alert-body">
                  <p className="alert-message">{alert.message}</p>
                  <p className="alert-meta">
                    {alert.label || shortenAddress(alert.address)} ·{' '}
                    {networkOf(alert.network).short}
                    {alert.asset ? ` · ${alert.asset}` : ''} · {formatClock(alert.at)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
