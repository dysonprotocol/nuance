export type WalletLike = {
  sendMsg: (args: {
    msg: unknown
    gasLimit?: number | 'auto'
    memo?: string
    executorAddress?: string
  }) => Promise<{ success: boolean; rawLog?: string }>
}
