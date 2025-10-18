import { useRepo } from 'pinia-orm'
import LatestBlock from '@/orm/models/base/TendermintService'

import TendermintBlock from '@/orm/models/tendermint/Block'
import TxBlock from '@/orm/models/tx/TxBlock'
import { ensureGlobalCrontaskEventSync } from '@/orm/subscriptions/crontaskEvents'
import { ensureGlobalBankTransferSync } from '@/orm/subscriptions/bankTransferEvents'
import { useWallet } from '@/composables/useWallet'

let started = false
let timer: ReturnType<typeof setTimeout> | null = null
// polling disabled; keep symbols removed to satisfy linter
let ws: globalThis.WebSocket | null = null
let wsFailures = 0
// wsActive no longer needed when polling disabled
// removed unused wsPushSeenAt/WS_STALE_MS

export function startLatestBlockPoller() {
  if (started) return
  started = true
  console.info('[tm.poll] start')
  // Disable HTTP polling; rely on WebSocket push updates only

  // Start global crontask event sync with known-creator filter
  try {
    const { unlockedWallets } = useWallet()
    const isKnownCreator = (address: string) => {
      const a = String(address || '').trim()
      if (!a) return false
      try {
        const list =
          (unlockedWallets as { value?: Array<{ address?: string }> } | undefined)?.value || []
        return list.some((w) => String(w?.address || '') === a)
      } catch (e) {
        console.error('[tm.ws] known-creator check error', e)
        return false
      }
    }
    ensureGlobalCrontaskEventSync({ isKnownCreator })
    const isKnownAddress = (address: string) => {
      const a = String(address || '').trim()
      if (!a) return false
      try {
        const list =
          (unlockedWallets as { value?: Array<{ address?: string }> } | undefined)?.value || []
        return list.some((w) => String(w?.address || '') === a)
      } catch (e) {
        console.error('[tm.ws] known-address check error', e)
        return false
      }
    }
    ensureGlobalBankTransferSync({ isKnownAddress })
  } catch (e) {
    console.error('[tm.ws] init crontask sync error', e)
  }

  function parseRpcWsUrl(): string | null {
    // Always use Vite proxy path to Tendermint RPC WS: /rpc/websocket
    try {
      const hasLocation = typeof globalThis !== 'undefined' && !!globalThis.location
      if (!hasLocation) return null
      const wsUrl = `/rpc/websocket`
      console.info('[tm.ws] url', wsUrl)
      return wsUrl
    } catch (e) {
      console.error('[tm.ws] build ws url error', e)
      return null
    }
  }

  function ensureWebSocket() {
    try {
      console.debug('[tm.ws] ensure')
      const wsUrl = parseRpcWsUrl()
      if (!wsUrl) {
        console.warn('[tm.ws] missing wsUrl; waiting for browser environment')
        globalThis.setTimeout(ensureWebSocket, 1000)
        return
      }
      if (typeof globalThis.WebSocket === 'undefined') {
        console.warn('[tm.ws] WebSocket API unavailable in this environment')
        return
      }
      if (
        ws &&
        (ws.readyState === globalThis.WebSocket.OPEN ||
          ws.readyState === globalThis.WebSocket.CONNECTING)
      ) {
        console.debug('[tm.ws] already open/connecting; skip new socket')
        return
      }
      ws = new globalThis.WebSocket(wsUrl)
      ws.onopen = () => {
        wsFailures = 0
        console.info('[tm.ws] open')
        ws!.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'subscribe',
            id: 1,
            params: { query: "tm.event='NewBlock'" },
          })
        )
        ws!.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'subscribe',
            id: 2,
            params: { query: "tm.event='Tx'" },
          })
        )
        console.debug('[tm.ws] subscribed NewBlock, Tx')
      }
      ws.onmessage = async (ev) => {
        // On any event, refresh latest block once; adaptive loop will handle pacing
        try {
          // Optional minimal debug for visibility
          try {
            const msg = JSON.parse(String(ev?.data ?? '{}')) as {
              result?: {
                events?: Record<string, unknown>
                data?: { type?: string; value?: unknown }
              }
            }
            // Upsert latest block directly from WS to avoid HTTP when possible
            const data = msg?.result?.data
            if (data && typeof data === 'object') {
              const typ = String(data.type || '')
              if (typ.includes('NewBlock') || typ.includes('NewBlockHeader')) {
                const value = (data as { value?: unknown }).value as
                  | {
                      block?: { header?: Record<string, unknown> }
                      header?: Record<string, unknown>
                      block_id?: { hash?: unknown }
                      result_finalize_block?: {
                        tx_results?: unknown[]
                      }
                    }
                  | undefined
                const header = (value?.block?.header || value?.header || {}) as Record<
                  string,
                  unknown
                >
                const blockId = (value?.block_id || {}) as { hash?: unknown }
                const lrepo = useRepo(LatestBlock)
                const height = String((header?.height as string | number | undefined) || '')
                if (height) {
                  lrepo.save({
                    singleton: 'default',
                    height,
                    time: String((header?.time as string | undefined) || ''),
                    proposer_address: String(
                      (header?.proposer_address as string | undefined) || ''
                    ),
                    chain_id: String((header?.chain_id as string | undefined) || ''),
                    hash: String(blockId?.hash ?? ''),
                  })
                  // Upsert height-indexed TendermintBlock to satisfy GetBlockByHeight consumers
                  useRepo(TendermintBlock).save({
                    height,
                    block_id: (value?.block_id as Record<string, unknown>) || {},
                    header,
                    data:
                      ((value?.block as { data?: Record<string, unknown> } | undefined)?.data as
                        | Record<string, unknown>
                        | undefined) || {},
                    evidence:
                      ((value?.block as { evidence?: Record<string, unknown> } | undefined)
                        ?.evidence as Record<string, unknown> | undefined) || {},
                    last_commit:
                      ((value?.block as { last_commit?: Record<string, unknown> } | undefined)
                        ?.last_commit as Record<string, unknown> | undefined) || {},
                  })
                  console.debug('[tm.ws] upsert latest', { height })

                  // Upsert TxBlock summary for the grid when we can derive tx count
                  try {
                    const txs = Array.isArray(
                      ((value?.block as { data?: { txs?: unknown[] } } | undefined)?.data || {}).txs
                    )
                      ? ((
                          (value?.block as { data?: { txs?: unknown[] } } | undefined)?.data as {
                            txs?: unknown[]
                          }
                        )?.txs as unknown[]) || []
                      : null
                    const txResults = Array.isArray(
                      (value?.result_finalize_block as { tx_results?: unknown[] } | undefined)
                        ?.tx_results
                    )
                      ? ((value?.result_finalize_block as { tx_results?: unknown[] })
                          .tx_results as unknown[])
                      : null

                    let txCount: number | null = null
                    if (txs !== null) txCount = txs.length
                    else if (txResults !== null) txCount = txResults.length

                    if (txCount !== null) {
                      useRepo(TxBlock).save({
                        height,
                        timestamp: String((header?.time as string | undefined) || ''),
                        tx_count: String(txCount),
                      })
                    }
                  } catch (e) {
                    console.error('[tm.ws] upsert TxBlock error', e)
                  }
                }

                // Emit all chain events as CustomEvents
                try {
                  const canDispatch =
                    typeof globalThis !== 'undefined' &&
                    typeof (globalThis as { dispatchEvent?: unknown }).dispatchEvent ===
                      'function' &&
                    typeof (globalThis as { CustomEvent?: unknown }).CustomEvent === 'function'
                  if (canDispatch) {
                    const fb = (
                      value as {
                        result_finalize_block?: {
                          events?: Array<{
                            type?: string
                            attributes?: Array<{ key?: string; value?: unknown; index?: unknown }>
                          }>
                          tx_results?: Array<{
                            events?: Array<{
                              type?: string
                              attributes?: Array<{
                                key?: string
                                value?: unknown
                                index?: unknown
                              }>
                            }>
                          }>
                        }
                      }
                    )?.result_finalize_block
                    type ChainEventAttr = { key?: string; value?: unknown; index?: unknown }
                    type ChainEvent = { type?: string; attributes?: ChainEventAttr[] }
                    const rawEvents = (fb && fb.events) || []
                    const rawTxResults = (fb && fb.tx_results) || []
                    const listA: ChainEvent[] = Array.isArray(rawEvents)
                      ? (rawEvents as ChainEvent[])
                      : []
                    const listB: ChainEvent[] = Array.isArray(rawTxResults)
                      ? rawTxResults.flatMap((r: { events?: ChainEvent[] }) =>
                          Array.isArray(r?.events) ? (r.events as ChainEvent[]) : []
                        )
                      : []
                    const all: ChainEvent[] = [...listA, ...listB]
                    for (const ev of all) {
                      const evtType = String(ev?.type || '').trim()
                      const attrs = Array.isArray(ev?.attributes) ? ev.attributes : []
                      if (!evtType || attrs.length === 0) continue
                      const detail: Record<string, unknown> = {}
                      for (const a of attrs) {
                        const k = String((a?.key as string | undefined) || '').trim()
                        if (!k) continue
                        const v = (a as { value?: unknown })?.value
                        if (Object.prototype.hasOwnProperty.call(detail, k)) {
                          const cur = detail[k]
                          detail[k] = Array.isArray(cur) ? [...(cur as unknown[]), v] : [cur, v]
                        } else {
                          detail[k] = v
                        }
                      }
                      try {
                        type CustomEventCtorLike = new (
                          type: string,
                          init?: { detail?: unknown }
                        ) => unknown
                        const CE = (globalThis as unknown as { CustomEvent?: CustomEventCtorLike })
                          .CustomEvent
                        if (CE) {
                          ;(
                            globalThis as unknown as { dispatchEvent: (e: unknown) => boolean }
                          ).dispatchEvent(new CE(evtType, { detail }))
                          //console.debug('[tm.ws] dispatched event', evtType, detail)
                        } else {
                          console.warn('[tm.ws] CustomEvent API unavailable in this environment')
                        }
                      } catch (e) {
                        console.error('[tm.ws] dispatch event error', e)
                      }
                    }
                  }
                } catch (e) {
                  console.error('[tm.ws] emit events error', e)
                }
              }
            }
          } catch (e) {
            const rawType = typeof (ev as { data?: unknown })?.data
            const rawSample =
              rawType === 'string'
                ? String((ev as { data?: string }).data).slice(0, 160) + '…'
                : rawType
            console.error('[tm.ws] parse error', { rawType, rawSample, error: e })
          }
          // Do not fetch on push; WS writes latest directly
        } catch (e) {
          console.error('[tm.ws] onmessage handler error', e)
        }
      }
      ws.onclose = (ev) => {
        wsFailures += 1
        ws = null
        // Fallback to polling continues; try to reconnect with backoff based on failures
        const backoff = Math.min(30000, 1000 * 2 ** Math.min(5, wsFailures))
        console.warn('[tm.ws] close', { code: ev?.code, reason: ev?.reason, backoff })
        globalThis.setTimeout(ensureWebSocket, backoff)
      }
      ws.onerror = (err) => {
        console.error('[tm.ws] error', err)
        try {
          ws?.close()
        } catch (e) {
          console.error('[tm.ws] error during close', e)
        }
      }
    } catch (e) {
      console.error('[latestBlockPoller][ws] ensure error', e)
    }
  }

  // Kick off once; ws will refresh latest on push
  ensureWebSocket()
}

export function stopLatestBlockPoller() {
  started = false
  if (timer) globalThis.clearTimeout(timer)
  timer = null
  try {
    ws?.close()
  } catch (e) {
    console.error('[tm.ws] stop close error', e)
  }
  ws = null
}
