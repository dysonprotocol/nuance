import { useAxiosRepo } from '@pinia-orm/axios'
import Balance from '@/orm/models/bank/Balance'
import SpendableBalance from '@/orm/models/bank/SpendableBalance'
import { unwrap } from './crontaskEvents'

let globalInitialized = false
const pending = new Set<string>()
const inflight = new Set<string>()
let scheduled = false

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return []
  return Array.isArray(val) ? val : [val]
}

async function refreshAddress(addr: string) {
  if (!addr) return
  if (inflight.has(addr)) return
  inflight.add(addr)
  try {
    await Promise.allSettled([
      useAxiosRepo(Balance).api().fetchByAddress(addr),
      useAxiosRepo(SpendableBalance).api().fetchAll(addr),
    ])
  } catch (e) {
    console.error('[bank.transfer] refresh error', { address: addr, error: e })
  } finally {
    inflight.delete(addr)
  }
}

function scheduleFlush() {
  if (scheduled) return
  scheduled = true
  globalThis.setTimeout(async () => {
    scheduled = false
    const addrs = Array.from(pending)
    pending.clear()
    for (const a of addrs) await refreshAddress(a)
  }, 0)
}

export function ensureGlobalBankTransferSync(args: {
  isKnownAddress: (address: string) => boolean
}): void {
  if (globalInitialized) return
  globalInitialized = true
  const { isKnownAddress } = args

  const handler = (ev: Event) => {
    try {
      const detail = (ev as CustomEvent)?.detail as Record<string, unknown> | undefined
      if (!detail) return
      const senders = toArray(detail.sender).map(unwrap)
      const recipients = toArray(detail.recipient).map(unwrap)
      const candidates = new Set<string>([...senders, ...recipients].filter(Boolean))
      for (const addr of candidates) if (isKnownAddress(addr)) pending.add(addr)
      if (pending.size) scheduleFlush()
    } catch (e) {
      console.error('[bank.transfer] handler error', e)
    }
  }

  globalThis.addEventListener('transfer', handler as EventListener)
}
