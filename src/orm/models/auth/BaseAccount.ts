import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'
import Balance from '../bank/Balance'
import SpendableBalance from '../bank/SpendableBalance'
import Delegation from '../staking/Delegation'
import DelegatorReward from '../distribution/DelegatorReward'
import DelegatorTotalReward from '../distribution/DelegatorTotalReward'
import Grant from '../authz/Grant'

type AnyAccount =
  | ({ address?: string; account_number?: string | number; sequence?: string | number } & Record<
      string,
      unknown
    >)
  | {
      base_account?: {
        address?: string
        account_number?: string | number
        sequence?: string | number
      }
    }

export class BaseAccount extends Model {
  static entity = 'accounts'
  static primaryKey = 'address'

  static fields() {
    return {
      address: this.string(''),
      account_number: this.string('0'),
      sequence: this.string('0'),
      balances: this.hasMany(Balance, 'address', 'address'),
      spendables: this.hasMany(SpendableBalance, 'address', 'address'),
      delegations: this.hasMany(Delegation, 'delegator_address', 'address'),
      rewards: this.hasMany(DelegatorReward, 'delegator_address', 'address'),
      total_rewards: this.hasMany(DelegatorTotalReward, 'delegator_address', 'address'),
      authz_grants_as_granter: this.hasMany(Grant, 'granter', 'address'),
      authz_grants_as_grantee: this.hasMany(Grant, 'grantee', 'address'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchAccountInfo(this: Request, address: string) {
          return this.get(`/cosmos/auth/v1beta1/account_info/${address}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                info?: {
                  address?: string
                  account_number?: string | number
                  sequence?: string | number
                }
              }
            }) => {
              const info = data?.info
              if (!info?.address) return []
              return [
                {
                  address: info.address,
                  account_number: String(info.account_number ?? '0'),
                  sequence: String(info.sequence ?? '0'),
                },
              ]
            },
          })
        },
        async fetchAccount(this: Request, address: string) {
          return this.get(`/cosmos/auth/v1beta1/accounts/${address}`, {
            dataTransformer: ({ data }: { data: { account?: AnyAccount | null } }) => {
              const acc = data?.account as AnyAccount | undefined
              if (!acc) return []
              const direct = acc as {
                address?: string
                account_number?: string | number
                sequence?: string | number
              }
              const nested = acc as {
                base_account?: {
                  address?: string
                  account_number?: string | number
                  sequence?: string | number
                }
              }
              const base = direct.address ? direct : nested.base_account
              if (!base?.address) return []
              return [
                {
                  address: base.address,
                  account_number: String(base.account_number ?? '0'),
                  sequence: String(base.sequence ?? '0'),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default BaseAccount
