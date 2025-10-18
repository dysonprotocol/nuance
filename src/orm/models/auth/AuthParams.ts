import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Params = {
  max_memo_characters?: string | number
  tx_sig_limit?: string | number
  tx_size_cost_per_byte?: string | number
  sig_verify_cost_ed25519?: string | number
  sig_verify_cost_secp256k1?: string | number
}

export class AuthParams extends Model {
  static entity = 'auth_params'
  static primaryKey = 'key'

  static fields() {
    return {
      key: this.string('default'),
      max_memo_characters: this.string('0'),
      tx_sig_limit: this.string('0'),
      tx_size_cost_per_byte: this.string('0'),
      sig_verify_cost_ed25519: this.string('0'),
      sig_verify_cost_secp256k1: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchParams(this: Request) {
          return this.get(`/cosmos/auth/v1beta1/params`, {
            dataTransformer: ({ data }: { data: { params?: Params } }) => {
              const p = data?.params || {}
              return [
                {
                  key: 'default',
                  max_memo_characters: String(p.max_memo_characters ?? '0'),
                  tx_sig_limit: String(p.tx_sig_limit ?? '0'),
                  tx_size_cost_per_byte: String(p.tx_size_cost_per_byte ?? '0'),
                  sig_verify_cost_ed25519: String(p.sig_verify_cost_ed25519 ?? '0'),
                  sig_verify_cost_secp256k1: String(p.sig_verify_cost_secp256k1 ?? '0'),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default AuthParams
