import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type Coin = { denom: string; amount: string }
type Owner = { address: string; balance: Coin }

export class DenomOwner extends Model {
  static entity = 'denom_owners'
  static primaryKey = ['denom', 'address']

  static fields() {
    return {
      denom: this.string(''),
      address: this.string(''),
      amount: this.string('0'),
      // avoid circular import; eager-load by address if needed
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchOwners(this: Request, denom: string, pageKey?: string) {
          const url = `/cosmos/bank/v1beta1/denom_owners/${encodeURIComponent(denom)}`
          const qs = pageKey ? `?pagination.key=${encodeURIComponent(pageKey)}` : ''
          return this.get(`${url}${qs}`, {
            dataTransformer: ({ data }: { data: { denom_owners?: Owner[] } }) =>
              (Array.isArray(data?.denom_owners) ? data.denom_owners : []).map((o) => ({
                denom,
                address: o.address,
                amount: o.balance?.amount ?? '0',
              })),
          })
        },
        async fetchOwnersByQuery(this: Request, denom: string, pageKey?: string) {
          const params = new URLSearchParams({ denom })
          if (pageKey) params.set('pagination.key', pageKey)
          return this.get(`/cosmos/bank/v1beta1/denom_owners_by_query?${params}`, {
            dataTransformer: ({ data }: { data: { denom_owners?: Owner[] } }) =>
              (Array.isArray(data?.denom_owners) ? data.denom_owners : []).map((o) => ({
                denom,
                address: o.address,
                amount: o.balance?.amount ?? '0',
              })),
          })
        },
      },
    },
  }
}

export default DenomOwner
