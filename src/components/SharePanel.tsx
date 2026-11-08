import { useEffect, useMemo, useState } from 'react'
import { formatAmount } from '../lib/format'
import { networkOf } from '../lib/networks'
import { shareLink, trustWalletSteps } from '../lib/share'
import type { Wallet } from '../lib/types'
import { Icon } from './Icon'
import { QrCode } from './QrCode'

interface Props {
  wallets: Wallet[]
  onClose: () => void
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
    } catch {
      /* clipboard blocked */
    }
    document.body.removeChild(area)
  }
}

export function SharePanel({ wallets, onClose }: Props) {
  const single = wallets.length === 1 ? wallets[0] : null
  const [copied, setCopied] = useState<'link' | 'address' | null>(null)

  const link = useMemo(() => (wallets.length > 0 ? shareLink(wallets) : ''), [wallets])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const flash = (what: 'link' | 'address') => {
    setCopied(what)
    window.setTimeout(() => setCopied((current) => (current === what ? null : current)), 1500)
  }

  if (!single && wallets.length === 0) return null

  const title = single ? `Share “${single.label}”` : `Share ${wallets.length} wallets`

  return (
    <div className="share-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="share-scrim" onClick={onClose} aria-label="Close" />
      <div className="share-card">
        <header className="share-head">
          <h2>
            <Icon name="share" size={16} /> {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </header>

        <div className="share-body">
          {single ? (
            <section className="share-block">
              <p className="share-label">
                Trust Wallet · view-only on any phone
              </p>
              <div className="share-address">
                <span className="mono">{single.address}</span>
                <button
                  type="button"
                  className={`icon-btn ${copied === 'address' ? 'is-done' : ''}`}
                  onClick={() => {
                    void copyText(single.address)
                    flash('address')
                  }}
                  aria-label="Copy address"
                  title="Copy address"
                >
                  <Icon name={copied === 'address' ? 'check' : 'copy'} size={14} />
                </button>
              </div>
              <div className="share-qr-row">
                <QrCode value={single.address} caption="Scan this to add the address" />
                <ol className="share-steps">
                  {trustWalletSteps(single.network, single.label).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <p className="share-note">
                <Icon name="shield" size={12} />
                Trust Wallet shows the address's real on-chain balance —{' '}
                {single.lastNative === null ? (
                  <>it will read whatever the chain says the moment you open it.</>
                ) : (
                  <>
                    {formatAmount(single.lastNative)} {networkOf(single.network).nativeSymbol} right
                    now.
                  </>
                )}{' '}
                The {formatAmount(single.expectedNative)}{' '}
                {networkOf(single.network).nativeSymbol} you assigned here stays in WatchVault as the
                amount to compare against — it never changes what the chain reports.
              </p>
            </section>
          ) : null}

          <section className="share-block">
            <p className="share-label">
              {single ? 'Move this wallet to another device' : 'Move these wallets to another device'}
            </p>
            <div className="share-qr-row">
              <QrCode value={link} caption="Scan with the other phone" />
              <div className="share-copy">
                <p className="share-hint">
                  Open this link on any device running WatchVault and it loads{' '}
                  {single ? 'this wallet' : `all ${wallets.length} wallets`} with the label, the
                  network, the assigned amount{single && single.tokens.length > 0 ? ' and its tokens' : ''}{' '}
                  — no typing.
                </p>
                <div className="share-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      void copyText(link)
                      flash('link')
                    }}
                  >
                    <Icon name={copied === 'link' ? 'check' : 'copy'} size={13} />
                    {copied === 'link' ? 'Link copied' : 'Copy link'}
                  </button>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={link}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="external" size={13} /> Open
                  </a>
                </div>
                <p className="share-fine">
                  The link carries public data only: address, network, label, assigned amount. No
                  keys, because none exist here.
                </p>
              </div>
            </div>
            {single ? null : (
              <ul className="share-list">
                {wallets.map((wallet) => (
                  <li key={wallet.id}>
                    <span>{wallet.label}</span>
                    <span className="mono">{networkOf(wallet.network).name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
