import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type BalancesResp = { balances?: Array<{ denom: string; amount: string }> }
const transformBalances =
  (address: string) =>
  ({ data }: { data: BalancesResp }) =>
    (Array.isArray(data?.balances) ? data.balances : []).map((b) => ({
      address,
      denom: b.denom,
      amount: b.amount,
    }))

function refreshBalances(this: Request, address: string) {
  return this.get(`/cosmos/bank/v1beta1/balances/${address}`, {
    dataTransformer: transformBalances(address),
  })
}

function ensureOk(res: { success: boolean; rawLog?: string }, msg: string) {
  if (!res?.success) throw new Error(res?.rawLog || msg)
}

export class Balance extends Model {
  static entity = 'balances'
  static primaryKey = ['address', 'denom']

  static fields() {
    return {
      address: this.string(''),
      denom: this.string(''),
      amount: this.string('0'),
      // Avoid circular import at type-level; consumers can eager-load via address
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchByAddress(this: Request, address: string) {
          return refreshBalances.call(this, address)
        },
        async fetchByDenom(this: Request, address: string, denom: string) {
          const qs = new URLSearchParams({ denom })
          return this.get(`/cosmos/bank/v1beta1/balances/${address}/by_denom?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: { balance?: { denom: string; amount: string } | null }
            }) => {
              const b = data?.balance
              return b ? [{ address, denom: b.denom, amount: b.amount }] : []
            },
          })
        },
        async sendCoins(
          this: Request,
          params: {
            fromAddress: string
            toAddress: string
            amount: string
            denom: string
            wallet: {
              sendMsg: (args: {
                msg: unknown
                gasLimit?: number | 'auto'
                memo?: string
                executorAddress?: string
              }) => Promise<{ success: boolean; rawLog?: string }>
            }
            gasLimit?: number | 'auto'
            memo?: string
          }
        ) {
          const { fromAddress, toAddress, amount, denom, wallet, gasLimit, memo } = params
          const msg = {
            '@type': '/cosmos.bank.v1beta1.MsgSend',
            from_address: fromAddress,
            to_address: toAddress,
            amount: [
              {
                denom,
                amount,
              },
            ],
          }

          const result = await wallet.sendMsg({ msg, gasLimit, memo, executorAddress: fromAddress })
          ensureOk(result, 'Bank send failed')

          await Promise.all([
            refreshBalances.call(this, fromAddress),
            refreshBalances.call(this, toAddress),
          ])

          return result
        },
        async multiSend(
          this: Request,
          params: {
            fromAddress: string
            inputs: Array<{ address: string; coins: Array<{ denom: string; amount: string }> }>
            outputs: Array<{ address: string; coins: Array<{ denom: string; amount: string }> }>
            wallet: {
              sendMsg: (args: {
                msg: unknown
                gasLimit?: number | 'auto'
                memo?: string
                executorAddress?: string
              }) => Promise<{ success: boolean; rawLog?: string }>
            }
            gasLimit?: number | 'auto'
            memo?: string
          }
        ) {
          const { fromAddress, inputs, outputs, wallet, gasLimit, memo } = params
          const msg = {
            '@type': '/cosmos.bank.v1beta1.MsgMultiSend',
            inputs,
            outputs,
          }
          const res = await wallet.sendMsg({ msg, gasLimit, memo, executorAddress: fromAddress })
          ensureOk(res, 'Bank multisend failed')
          // Refresh all unique addresses touched
          const addrs = new Set<string>()
          inputs.forEach((i) => addrs.add(i.address))
          outputs.forEach((o) => addrs.add(o.address))
          await Promise.all(Array.from(addrs).map((a) => refreshBalances.call(this, a)))
          return res
        },
      },
    },
  }
}

export default Balance
