import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

export class StorageMetrics extends Model {
  static entity = 'storage_metrics'
  static primaryKey = 'owner'

  static fields() {
    return {
      owner: this.string(''),
      total_bytes: this.string('0'),
      min_stake_amount: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request, owner: string) {
          const qs = new URLSearchParams({ owner })
          return this.get(`/dysonprotocol/storage/v1/metrics?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                owner?: string
                total_bytes?: string | number
                min_stake_amount?: string
              }
            }) => {
              return [
                {
                  owner: String(data?.owner || owner || ''),
                  total_bytes: String(data?.total_bytes ?? '0'),
                  min_stake_amount: String(data?.min_stake_amount ?? '0'),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default StorageMetrics
