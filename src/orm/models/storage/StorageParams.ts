import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type ParamsShape = {
  params?: {
    max_storage_size?: string | number
    storage_stake_multiple?: string
  }
}

export class StorageParams extends Model {
  static entity = 'storage_params'
  static primaryKey = 'default'

  static fields() {
    return {
      default: this.string('default'),
      max_storage_size: this.string('0'),
      storage_stake_multiple: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request) {
          return this.get(`/dysonprotocol/storage/v1/params`, {
            dataTransformer: ({ data }: { data: ParamsShape }) => {
              const p = data?.params || {}
              return [
                {
                  default: 'default',
                  max_storage_size: String(p?.max_storage_size ?? '0'),
                  storage_stake_multiple: String(p?.storage_stake_multiple ?? '0'),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default StorageParams


