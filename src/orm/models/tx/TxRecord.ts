import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Tx = Record<string, unknown>
type TxResponse = {
  txhash?: string
  height?: string | number
  timestamp?: string
  codespace?: string
  code?: string | number
  raw_log?: string
  gas_used?: string | number
  gas_wanted?: string | number
}

type TxRow = {
  hash: string
  height: string
  timestamp: string
  codespace: string
  code: string
  raw_log: string
  gas_used: string
  gas_wanted: string
  tx: Tx
  tx_response: TxResponse
}

export class TxRecord extends Model {
  static entity = 'tx_records'
  static primaryKey = 'hash'

  static fields() {
    return {
      hash: this.string(''),
      height: this.string('0'),
      timestamp: this.string(''),
      codespace: this.string(''),
      code: this.string('0'),
      raw_log: this.string(''),
      gas_used: this.string('0'),
      gas_wanted: this.string('0'),
      tx: this.attr({}),
      tx_response: this.attr({}),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchByHash(this: Request, hash: string) {
          return this.get(`/cosmos/tx/v1beta1/txs/${hash}`, {
            dataTransformer: ({
              data,
            }: {
              data: { tx?: Tx | null; tx_response?: TxResponse | null }
            }) => {
              const r = data?.tx_response || {}
              const h = r?.txhash || hash
              if (!h) return []
              return [
                {
                  hash: h,
                  height: String(r.height ?? '0'),
                  timestamp: String(r.timestamp ?? ''),
                  codespace: String(r.codespace ?? ''),
                  code: String(r.code ?? '0'),
                  raw_log: String(r.raw_log ?? ''),
                  gas_used: String(r.gas_used ?? '0'),
                  gas_wanted: String(r.gas_wanted ?? '0'),
                  tx: data?.tx || {},
                  tx_response: data?.tx_response || {},
                },
              ]
            },
          })
        },
        async searchInit(
          this: Request,
          params: { query: string; limit?: string; order_by?: string }
        ): Promise<{
          next_key?: string
          total?: string
          returned?: number
          page?: number
          limit?: string
        }> {
          const { query, limit, order_by } = params
          const qs = new URLSearchParams({ query })
          if (limit) qs.set('pagination.limit', limit)
          if (order_by) qs.set('order_by', order_by)
          let nextKey: string | undefined
          let total: string | undefined
          let returned = 0
          await this.get(`/cosmos/tx/v1beta1/txs?${qs.toString()}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                txs?: Tx[]
                tx_responses?: TxResponse[]
                pagination?: { next_key?: string; total?: string | number }
                total?: string | number
              }
            }) => {
              const txs = Array.isArray(data?.txs) ? data.txs : []
              const resps = Array.isArray(data?.tx_responses) ? data.tx_responses : []
              returned = resps.length
              nextKey = data?.pagination?.next_key || ''
              const tot = (data?.pagination?.total ?? data?.total) as string | number | undefined
              total = typeof tot === 'number' ? String(tot) : tot
              const rows: TxRow[] = []
              for (let i = 0; i < resps.length; i++) {
                const r = resps[i] || {}
                const t = txs[i] || {}
                const h = r?.txhash || ''
                if (!h) continue
                rows.push({
                  hash: h,
                  height: String(r.height ?? '0'),
                  timestamp: String(r.timestamp ?? ''),
                  codespace: String(r.codespace ?? ''),
                  code: String(r.code ?? '0'),
                  raw_log: String(r.raw_log ?? ''),
                  gas_used: String(r.gas_used ?? '0'),
                  gas_wanted: String(r.gas_wanted ?? '0'),
                  tx: t,
                  tx_response: r,
                })
              }
              return rows
            },
          })
          return { next_key: nextKey || undefined, total, returned, page: 1, limit }
        },
        async searchLoadMore(
          this: Request,
          params: {
            query: string
            limit?: string
            next_key?: string
            page?: number
            order_by?: string
          }
        ): Promise<{
          next_key?: string
          total?: string
          returned?: number
          page?: number
          limit?: string
        }> {
          const { query, limit } = params
          const qs = new URLSearchParams({ query })
          let page = params.page
          if (params.next_key) qs.set('pagination.key', params.next_key)
          else if (page) qs.set('page', String(page))
          if (limit) qs.set(params.next_key ? 'pagination.limit' : 'limit', limit)
          if (params.order_by) qs.set('order_by', params.order_by)
          let nextKey: string | undefined
          let total: string | undefined
          let returned = 0
          await this.get(`/cosmos/tx/v1beta1/txs?${qs.toString()}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                txs?: Tx[]
                tx_responses?: TxResponse[]
                pagination?: { next_key?: string; total?: string | number }
                total?: string | number
              }
            }) => {
              const txs = Array.isArray(data?.txs) ? data.txs : []
              const resps = Array.isArray(data?.tx_responses) ? data.tx_responses : []
              returned = resps.length
              nextKey = data?.pagination?.next_key || ''
              const tot = (data?.pagination?.total ?? data?.total) as string | number | undefined
              total = typeof tot === 'number' ? String(tot) : tot
              const rows: TxRow[] = []
              for (let i = 0; i < resps.length; i++) {
                const r = resps[i] || {}
                const t = txs[i] || {}
                const h = r?.txhash || ''
                if (!h) continue
                rows.push({
                  hash: h,
                  height: String(r.height ?? '0'),
                  timestamp: String(r.timestamp ?? ''),
                  codespace: String(r.codespace ?? ''),
                  code: String(r.code ?? '0'),
                  raw_log: String(r.raw_log ?? ''),
                  gas_used: String(r.gas_used ?? '0'),
                  gas_wanted: String(r.gas_wanted ?? '0'),
                  tx: t,
                  tx_response: r,
                })
              }
              return rows
            },
          })
          if (!params.next_key && page) page += 1
          return { next_key: nextKey || undefined, total, returned, page, limit }
        },
        async fetchBlockWithTxs(this: Request, height: string | number) {
          return this.get(`/cosmos/tx/v1beta1/txs/block/${height}`, {
            dataTransformer: ({ data }: { data: { txs?: Tx[]; tx_responses?: TxResponse[] } }) => {
              const txs = Array.isArray(data?.txs) ? data.txs : []
              const resps = Array.isArray(data?.tx_responses) ? data.tx_responses : []
              const rows: TxRow[] = []
              for (let i = 0; i < resps.length; i++) {
                const r = resps[i] || {}
                const t = txs[i] || {}
                const h = r?.txhash || ''
                if (!h) continue
                rows.push({
                  hash: h,
                  height: String(r.height ?? '0'),
                  timestamp: String(r.timestamp ?? ''),
                  codespace: String(r.codespace ?? ''),
                  code: String(r.code ?? '0'),
                  raw_log: String(r.raw_log ?? ''),
                  gas_used: String(r.gas_used ?? '0'),
                  gas_wanted: String(r.gas_wanted ?? '0'),
                  tx: t,
                  tx_response: r,
                })
              }
              return rows
            },
          })
        },
        // Simulate, broadcast, and encode/decode endpoints intentionally not supported here
      },
    },
  }
}

export default TxRecord
