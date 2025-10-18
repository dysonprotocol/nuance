import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Json = Record<string, unknown>

export class TendermintBlock extends Model {
  static entity = 'tm_blocks'
  static primaryKey = 'height'

  static fields() {
    return {
      height: this.string('0'),
      block_id: this.attr({}),
      header: this.attr({}),
      data: this.attr({}),
      evidence: this.attr({}),
      last_commit: this.attr({}),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchWithTxs(
          this: Request,
          height: string | number,
          opts?: { pageKey?: string; limit?: string }
        ) {
          const h = String(height)
          const qs = new URLSearchParams()
          if (opts?.pageKey) qs.set('pagination.key', opts.pageKey)
          if (opts?.limit) qs.set('pagination.limit', opts.limit)

          // Use different endpoint for "latest"
          const basePath =
            h === 'latest'
              ? '/cosmos/base/tendermint/v1beta1/blocks/latest'
              : `/cosmos/tx/v1beta1/txs/block/${h}`
          const path = qs.toString() && h !== 'latest' ? `${basePath}?${qs.toString()}` : basePath

          return this.get(path, {
            dataTransformer: ({
              data,
            }: {
              data: {
                block?: { header?: Json; data?: Json; evidence?: Json; last_commit?: Json }
                sdk_block?: { header?: Json; data?: Json; evidence?: Json; last_commit?: Json }
                block_id?: Json
              }
            }) => {
              // Handle both tx endpoint format and blocks endpoint format
              const blockData = data?.block || data?.sdk_block
              const header = (blockData?.header as Json) || {}
              const mapped = {
                height: String((header?.height as string | number | undefined) ?? h),
                block_id: (data?.block_id as Json) || {},
                header,
                data: (blockData?.data as Json) || {},
                evidence: (blockData?.evidence as Json) || {},
                last_commit: (blockData?.last_commit as Json) || {},
              }
              return [mapped]
            },
          })
        },
      },
    },
  }
}

export default TendermintBlock
