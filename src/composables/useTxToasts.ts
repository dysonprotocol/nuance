/* no router needed for custom link */
import { toast } from 'vue-sonner'
import { useWallet } from '@/composables/useWallet'
import { defineComponent, h, markRaw, watch } from 'vue'

const publishedKeys = new Set<string>()

interface TxHistoryItem {
  txHash: string
  timestamp: number
  type: string
  fromAddress: string
  toAddress: string
  amount?: unknown
  status: string
}

function shortHash(hash: string) {
  if (!hash) return ''
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

function CustomTxToast(title: string, statusText: string, hash: string) {
  const href = `/txs/${hash}`
  return markRaw(
    defineComponent({
      name: 'CustomTxToast',
      setup() {
        return () =>
          h('div', { class: 'space-y-1' }, [
            h('div', { class: 'text-sm opacity-80' }, [
              statusText,
              ' · ',
              h('a', { href, class: 'underline underline-offset-4' }, shortHash(hash)),
            ]),
            h('div', { class: 'font-medium' }, title || 'Transaction'),
          ])
      },
    })
  )
}

export function useTxToasts() {
  const { txHistory, removeTransaction } = useWallet()

  watch(
    () => txHistory.value,
    (list) => {
      if (!Array.isArray(list)) return
      const arr = list as unknown as TxHistoryItem[]
      for (const item of arr) {
        const key = `${item.txHash}:${item.status}`
        if (publishedKeys.has(key)) continue

        const title = item.type || 'Transaction'
        const statusText = String(item.status || '').toLowerCase()
        const status = String(item.status || '').toLowerCase()
        const isError = status === 'failed' || status === 'error'
        const isSuccess = status === 'success'
        const show = isError ? toast.error : isSuccess ? toast.success : toast.message
        const Comp = CustomTxToast(title, statusText, item.txHash)
        show(Comp as unknown as string, {
          id: key,
          duration: 999999,
          onDismiss: () => {
            try {
              removeTransaction(item.txHash)
            } catch {
              console.error('Failed to remove transaction from txHistory', item.txHash)
            }
          },
          onAutoClose: () => {
            try {
              removeTransaction(item.txHash)
            } catch {
              console.error('Failed to remove transaction from txHistory', item.txHash)
            }
          },
        })

        publishedKeys.add(key)
      }
    },
    { deep: true, immediate: true }
  )
}

export default useTxToasts
