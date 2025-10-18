import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

export class SendEnabled extends Model {
  static entity = 'send_enabled'
  static primaryKey = 'denom'

  static fields() {
    return {
      denom: this.string(''),
      enabled: this.boolean(false),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchAll(this: Request, denoms: string[] = []) {
          const qs = new URLSearchParams()
          denoms.forEach((d) => qs.append('denoms', d))
          const suffix = denoms.length ? `?${qs}` : ''
          return this.get(`/cosmos/bank/v1beta1/send_enabled${suffix}`, {
            dataTransformer: ({
              data,
            }: {
              data: { send_enabled?: Array<{ denom: string; enabled: boolean }> }
            }) =>
              (Array.isArray(data?.send_enabled) ? data.send_enabled : []).map((e) => ({
                denom: e.denom,
                enabled: Boolean(e.enabled),
              })),
          })
        },
      },
    },
  }
}

export default SendEnabled
