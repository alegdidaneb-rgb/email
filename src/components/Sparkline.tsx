import type { Snapshot } from '../lib/types'

interface Props {
  history: Snapshot[]
  expected: number
}

const WIDTH = 260
const HEIGHT = 46
const PAD = 3

/** Tiny balance history line with a dashed line marking the assigned amount. */
export function Sparkline({ history, expected }: Props) {
  if (history.length < 2) return null

  const values = history.map((s) => Number(s.eth)).filter((n) => Number.isFinite(n))
  if (values.length < 2) return null

  const all = [...values, expected].filter((n) => Number.isFinite(n))
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || Math.max(max, 0.0001)

  const x = (i: number) => PAD + (i / (values.length - 1)) * (WIDTH - PAD * 2)
  const y = (v: number) => HEIGHT - PAD - ((v - min) / span) * (HEIGHT - PAD * 2)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const last = values[values.length - 1]
  const drifted = Math.abs(last - expected) > 0

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Balance history, latest ${last} ETH, assigned ${expected} ETH`}
    >
      <line
        x1={PAD}
        x2={WIDTH - PAD}
        y1={y(expected)}
        y2={y(expected)}
        className="sparkline-target"
        strokeDasharray="4 4"
      />
      <path d={line} className="sparkline-line" />
      <circle
        cx={x(values.length - 1)}
        cy={y(last)}
        r="2.6"
        className={drifted ? 'sparkline-dot is-drift' : 'sparkline-dot'}
      />
    </svg>
  )
}
