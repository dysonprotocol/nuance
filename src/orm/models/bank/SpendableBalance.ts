import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type CoinsResp = { balances?: Array<{ denom: string; amount: string }> }
type CoinResp = { balance?: { denom: string; amount: string } | null }

const toList = (list?: Array<{ denom: string; amount: string }>) =>
  (Array.isArray(list) ? list : []).map((c) => ({ denom: c.denom, amount: c.amount }))

export class SpendableBalance extends Model {
  static entity = 'spendable_balances'
  static primaryKey = ['address', 'denom']

  static fields() {
    return {
      address: this.string(''),
      denom: this.string(''),
      amount: this.string('0'),
      // avoid circular import; eager-load by address if needed
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchAll(this: Request, address: string) {
          return this.get(`/cosmos/bank/v1beta1/spendable_balances/${address}`, {
            dataTransformer: ({ data }: { data: CoinsResp }) =>
              toList(data?.balances).map((c) => ({ address, denom: c.denom, amount: c.amount })),
          })
        },
        async fetchByDenom(this: Request, address: string, denom: string) {
          const qs = new URLSearchParams({ denom })
          return this.get(`/cosmos/bank/v1beta1/spendable_balances/${address}/by_denom?${qs}`, {
            dataTransformer: ({ data }: { data: CoinResp }) => {
              const b = data?.balance
              return b ? [{ address, denom: b.denom, amount: b.amount }] : []
            },
          })
        },
      },
    },
  }
}

export default SpendableBalance
