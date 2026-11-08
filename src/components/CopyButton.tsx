import { useState } from 'react'
import { Icon } from './Icon'

interface Props {
  address: string
  className?: string
}

export function CopyButton({ address, className }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
    } catch {
      // Clipboard API can be blocked; fall back to a temporary textarea.
      const el = document.createElement('textarea')
      el.value = address
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      try {
        document.execCommand('copy')
      } catch {
        /* give up silently */
      }
      document.body.removeChild(el)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      type="button"
      className={`icon-btn ${copied ? 'is-done' : ''} ${className ?? ''}`}
      onClick={copy}
      title={copied ? 'Copied' : 'Copy address'}
      aria-label={copied ? 'Copied' : 'Copy address'}
    >
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  )
}
