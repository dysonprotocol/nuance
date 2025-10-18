import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type AnyObj = Record<string, unknown>

export class NftItem extends Model {
  static entity = 'nft_items'
  static primaryKey = ['class_id', 'id']

  static fields() {
    return {
      class_id: this.string(''),
      id: this.string(''),
      owner: this.string(''),
      uri: this.string(''),
      uri_hash: this.string(''),
      data: this.attr({} as AnyObj),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchNftWithOwner(this: Request, classId: string, id: string) {
          await this.fetchNft(classId, id)
          await this.fetchOwner(classId, id)
        },
        async fetchNft(this: Request, classId: string, id: string) {
          const qs = new URLSearchParams({ class_id: classId, id })
          return this.get(`/dysonprotocol/nft/v1beta1/nft?${qs}`, {
            dataTransformer: ({ data }: { data: { nft?: AnyObj | null } }) => {
              const n = data?.nft || {}
              const class_id = String((n as AnyObj)?.class_id || classId || '')
              const nid = String((n as AnyObj)?.id || id || '')
              if (!class_id || !nid) return []
              return [
                {
                  class_id,
                  id: nid,
                  owner: '',
                  uri: String((n as AnyObj)?.uri || ''),
                  uri_hash: String((n as AnyObj)?.uri_hash || ''),
                  data: (n as AnyObj)?.data || {},
                },
              ]
            },
          })
        },
        async fetchOwner(this: Request, classId: string, id: string) {
          const qs = new URLSearchParams({ class_id: classId, id })
          return this.get(`/dysonprotocol/nft/v1beta1/owner?${qs}`, {
            dataTransformer: ({ data }: { data: { owner?: string } }) => {
              const owner = String(data?.owner || '')
              if (!classId || !id) return []
              return [
                {
                  class_id: classId,
                  id,
                  owner,
                },
              ]
            },
          })
        },
        async fetchNfts(
          this: Request,
          params: {
            class_id?: string
            owner?: string
            next_key?: string
            page?: number
            limit?: string
          }
        ): Promise<{
          next_key?: string
          total?: string
          returned?: number
          page?: number
          limit?: string
        }> {
          const { class_id, owner, limit } = params
          const qs = new URLSearchParams()
          if (class_id) qs.set('class_id', class_id)
          if (owner) qs.set('owner', owner)
          let page = params.page
          if (params.next_key) qs.set('pagination.key', params.next_key)
          else if (page) qs.set('page', String(page))
          if (limit) qs.set(params.next_key ? 'pagination.limit' : 'limit', limit)
          let nextKey: string | undefined
          let total: string | undefined
          let returned = 0
          await this.get(`/dysonprotocol/nft/v1beta1/nfts?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                nfts?: Array<{
                  class_id?: string
                  id?: string
                  uri?: string
                  uri_hash?: string
                  data?: AnyObj
                }>
                pagination?: { next_key?: string; total?: string | number }
              }
            }) => {
              const list = Array.isArray(data?.nfts) ? data.nfts : []
              returned = list.length
              nextKey = data?.pagination?.next_key || ''
              const tot = data?.pagination?.total
              total = typeof tot === 'number' ? String(tot) : (tot as string | undefined)
              return list
                .filter((n) => n?.class_id && n?.id)
                .map((n) => ({
                  class_id: String(n.class_id),
                  id: String(n.id),
                  owner: owner ? String(owner) : '',
                  uri: String(n.uri || ''),
                  uri_hash: String(n.uri_hash || ''),
                  data: n.data || {},
                }))
            },
          })
          if (!params.next_key && page) page += 1
          return { next_key: nextKey || undefined, total, returned, page, limit }
        },
        async send(
          this: Request,
          params: {
            class_id: string
            id: string
            sender: string
            receiver: string
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
            refreshOwners?: Array<{ class_id: string; owner: string }>
          }
        ) {
          const { class_id, id, sender, receiver, wallet, gasLimit, memo, refreshOwners } = params
          const msg = {
            '@type': '/dysonprotocol.nft.v1beta1.MsgSend',
            class_id,
            id,
            sender,
            receiver,
          }
          const res = await wallet.sendMsg({ msg, gasLimit, memo, executorAddress: sender })
          if (!res?.success) throw new Error(res?.rawLog || 'NFT send failed')
          // Use proper actions to refresh state
          await Promise.allSettled([
            // refresh the specific NFT (metadata) then owner mapping
            this.fetchNft(class_id, id),
            this.fetchOwner(class_id, id),
          ])
          // Optionally refresh owners' NFT listings
          if (Array.isArray(refreshOwners) && refreshOwners.length > 0) {
            await Promise.allSettled(
              refreshOwners.map((r) => this.fetchNfts({ class_id: r.class_id, owner: r.owner }))
            )
          }
          return res
        },
      },
    },
  }
}

export default NftItem
