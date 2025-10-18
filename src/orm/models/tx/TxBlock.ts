import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Tx = Record<string, unknown>
type TxResponse = {
  txhash?: string
  height?: string | number
  timestamp?: string
}
type BlockLike = { header?: { time?: string; height?: string | number } }

export class TxBlock extends Model {
  static entity = 'tx_blocks'
  static primaryKey = 'height'

  static fields() {
    return {
      height: this.string('0'),
      timestamp: this.string(''),
      tx_count: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchSummary(this: Request, height: string | number) {
          return this.get(`/cosmos/tx/v1beta1/txs/block/${height}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                txs?: Tx[]
                tx_responses?: TxResponse[]
                block?: BlockLike
                sdk_block?: BlockLike
              }
            }) => {
              const txs = Array.isArray(data?.txs) ? data.txs : []
              const resps = Array.isArray(data?.tx_responses) ? data.tx_responses : []
              const anyResp = (resps[0] || {}) as TxResponse
              const header = ((data?.block || data?.sdk_block || {}) as BlockLike).header || {}
              const outHeight = (anyResp?.height as string | number | undefined) ?? header?.height
              const outTs =
                (anyResp?.timestamp as string | undefined) ||
                (header?.time as string | undefined) ||
                ''
              return [
                {
                  height: String(outHeight ?? height ?? '0'),
                  timestamp: String(outTs || ''),
                  tx_count: String(txs.length),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default TxBlock
