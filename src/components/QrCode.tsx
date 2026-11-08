import { useEffect, useState } from 'react'

interface Props {
  value: string
  size?: number
  caption?: string
}

/**
 * A plain QR code, rendered as inline SVG so it stays crisp at any size and
 * needs no canvas. Trust Wallet's view-only import reads the address straight
 * off the screen; the share link works the same way for another phone.
 *
 * The encoder is imported on demand so the dashboard bundle stays small — the
 * QR library only loads when a share sheet is actually opened.
 */
export function QrCode({ value, size = 188, caption }: Props) {
  const [markup, setMarkup] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void import('qrcode-generator')
      .then((module) => {
        if (!alive) return
        try {
          const code = module.default(0, 'M')
          code.addData(value)
          code.make()
          setMarkup(code.createSvgTag({ cellSize: 4, margin: 2, scalable: true }))
        } catch {
          setMarkup(null)
        }
      })
      .catch(() => {
        if (alive) setMarkup(null)
      })
    return () => {
      alive = false
    }
  }, [value])

  if (!markup) {
    return (
      <div
        className="qr-frame qr-pending"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    )
  }

  return (
    <figure className="qr">
      <div
        className="qr-frame"
        style={{ width: size, height: size }}
        role="img"
        aria-label={caption ?? 'QR code'}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {caption && <figcaption className="qr-caption">{caption}</figcaption>}
    </figure>
  )
}
