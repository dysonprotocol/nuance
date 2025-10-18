import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type CoinsResp = { supply?: Array<{ denom: string; amount: string }> }
type CoinResp = { amount?: { denom: string; amount: string } | null }

export class Supply extends Model {
  static entity = 'supplies'
  static primaryKey = 'denom'

  static fields() {
    return {
      denom: this.string(''),
      amount: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchAll(this: Request) {
          return this.get(`/cosmos/bank/v1beta1/supply`, {
            dataTransformer: ({ data }: { data: CoinsResp }) =>
              (Array.isArray(data?.supply) ? data.supply : []).map((c) => ({
                denom: c.denom,
                amount: c.amount,
              })),
          })
        },
        async fetchByDenom(this: Request, denom: string) {
          const qs = new URLSearchParams({ denom })
          return this.get(`/cosmos/bank/v1beta1/supply/by_denom?${qs}`, {
            dataTransformer: ({ data }: { data: CoinResp }) => {
              const a = data?.amount
              return a ? [{ denom: a.denom, amount: a.amount }] : []
            },
          })
        },
      },
    },
  }
}

export default Supply
