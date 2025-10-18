import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Params = {
  default_send_enabled?: boolean
  send_enabled?: Array<{ denom: string; enabled: boolean }>
}

export class BankParams extends Model {
  static entity = 'bank_params'
  static primaryKey = 'key'

  static fields() {
    return {
      key: this.string('default'),
      default_send_enabled: this.boolean(true),
      // Keep raw to avoid losing data, even though it's deprecated in params
      send_enabled: this.attr<Array<{ denom: string; enabled: boolean }>>([]),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchParams(this: Request) {
          return this.get(`/cosmos/bank/v1beta1/params`, {
            dataTransformer: ({ data }: { data: { params?: Params } }) => {
              const p = data?.params || {}
              return [
                {
                  key: 'default',
                  default_send_enabled: Boolean(p.default_send_enabled),
                  send_enabled: Array.isArray(p.send_enabled) ? p.send_enabled : [],
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default BankParams
