import DenomMetadata from '@/orm/models/bank/DenomMetadata'

export function formatTimestamp(value: string): string {
  if (!value) return ''
  const s = String(value).trim()
  if (!s) return ''
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) {
    const ms = s.length <= 10 ? n * 1000 : n
    const d = new Date(ms)
    return isNaN(d.getTime()) ? s : d.toLocaleString()
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString()
}

export function formatCoin(c?: { amount?: string; denom?: string } | null): string {
  const amount = String(c?.amount || '0')
  const denom = String(c?.denom || '')
  if (!denom) return amount
  const norm = DenomMetadata.normalize({ amount, denom })
  return `${norm.display.amount} ${norm.display.denom}`
}

export function formatGasPrice(task: {
  task_gas_limit?: string | number
  task_gas_fee?: { amount?: string; denom?: string } | null
}): string {
  const limitNum = Number(task?.task_gas_limit || '0')
  if (!Number.isFinite(limitNum) || limitNum <= 0) return ''
  const fee = task?.task_gas_fee || {}
  const denom = String(fee?.denom || '')
  const amount = String(fee?.amount || '0')
  if (!denom) return ''
  const norm = DenomMetadata.normalize({ amount, denom })
  // Use base units to avoid tiny values rounding to zero in display units
  const baseAmountNum = Number(norm.base.amount || '0')
  const price = baseAmountNum / limitNum
  const pretty = Number.isFinite(price)
    ? price.toLocaleString(undefined, { maximumFractionDigits: 8 })
    : '0'
  return `${pretty}`
}

function toMs(value: string): number | null {
  const s = String(value || '').trim()
  if (!s) return null
  const n = Number(s)
  if (Number.isFinite(n) && n > 0) {
    // Heuristic by magnitude: seconds/ms/µs/ns
    if (n < 1e11) return Math.floor(n * 1000) // seconds
    if (n < 1e14) return Math.floor(n) // milliseconds
    if (n < 1e17) return Math.floor(n / 1e3) // microseconds -> ms
    return Math.floor(n / 1e6) // nanoseconds -> ms
  }
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.getTime()
}

export function formatShortDelta(value: string, nowMs: number): string {
  const targetMs = toMs(value)
  if (targetMs == null || !Number.isFinite(nowMs)) return ''
  let diff = targetMs - nowMs
  if (!Number.isFinite(diff)) return ''
  if (diff < 0) diff = 0
  if (diff === 0) return 'now'

  const SEC = 1000
  const MIN = 60 * SEC
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  const parts: string[] = []
  const d = Math.floor(diff / DAY)
  if (d > 0) {
    parts.push(`${d}d`)
    diff -= d * DAY
  }
  const h = Math.floor(diff / HOUR)
  if (h > 0) {
    parts.push(`${h}h`)
    diff -= h * HOUR
  }
  const m = Math.floor(diff / MIN)
  if (m > 0 && parts.length < 2) {
    parts.push(`${m}m`)
    diff -= m * MIN
  }
  const sec = Math.ceil(diff / SEC)
  if (parts.length < 2) parts.push(`${sec}s`)

  return parts.slice(0, 2).join(' ')
}
