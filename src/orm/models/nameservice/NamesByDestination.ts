import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'
import { useAxiosRepo } from '@pinia-orm/axios'
import NftItem from '../nft/NftItem'

export class NamesByDestination extends Model {
  static entity = 'nameservice_names_by_destination'
  static primaryKey = 'name'

  static fields() {
    return {
      destination: this.string(''),
      name: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchInit(
          this: Request,
          params: { destination: string; limit?: string }
        ): Promise<{
          next_key?: string
          total?: string
          returned?: number
          page?: number
          limit?: string
        }> {
          const { destination, limit } = params
          const qs = new URLSearchParams()
          if (limit) qs.set('pagination.limit', limit)
          let nextKey: string | undefined
          let total: string | undefined
          let returned = 0
          let fetchedNames: string[] = []
          await this.get(
            `/dysonprotocol/nameservice/v1/names_by_destination/${encodeURIComponent(
              destination
            )}?${qs}`,
            {
              dataTransformer: ({
                data,
              }: {
                data: {
                  names?: string[]
                  pagination?: { next_key?: string; total?: string | number }
                }
              }) => {
                const list = Array.isArray(data?.names) ? data.names : []
                returned = list.length
                nextKey = data?.pagination?.next_key || ''
                const tot = data?.pagination?.total
                total = typeof tot === 'number' ? String(tot) : (tot as string | undefined)
                fetchedNames = list.map((n) => String(n))
                return list.map((n) => ({ destination, name: String(n) }))
              },
            }
          )
          if (fetchedNames.length > 0) {
            const results = await Promise.allSettled(
              fetchedNames.map((nm) =>
                useAxiosRepo(NftItem).api().fetchNftWithOwner('nameservice.dys', nm)
              )
            )
            for (const r of results) if (r.status === 'rejected') console.error(r.reason)
          }
          return { next_key: nextKey || undefined, total, returned, page: 1, limit }
        },
        async fetchLoadMore(
          this: Request,
          params: { destination: string; next_key?: string; page?: number; limit?: string }
        ): Promise<{
          next_key?: string
          total?: string
          returned?: number
          page?: number
          limit?: string
        }> {
          const { destination, limit } = params
          const qs = new URLSearchParams()
          let page = params.page
          if (params.next_key) qs.set('pagination.key', params.next_key)
          else if (page) qs.set('page', String(page))
          if (limit) qs.set(params.next_key ? 'pagination.limit' : 'limit', limit)
          let nextKey: string | undefined
          let total: string | undefined
          let returned = 0
          let fetchedNames: string[] = []
          await this.get(
            `/dysonprotocol/nameservice/v1/names_by_destination/${encodeURIComponent(
              destination
            )}?${qs}`,
            {
              dataTransformer: ({
                data,
              }: {
                data: {
                  names?: string[]
                  pagination?: { next_key?: string; total?: string | number }
                }
              }) => {
                const list = Array.isArray(data?.names) ? data.names : []
                returned = list.length
                nextKey = data?.pagination?.next_key || ''
                const tot = data?.pagination?.total
                total = typeof tot === 'number' ? String(tot) : (tot as string | undefined)
                fetchedNames = list.map((n) => String(n))
                return list.map((n) => ({ destination, name: String(n) }))
              },
            }
          )
          if (!params.next_key && page) page += 1
          if (fetchedNames.length > 0) {
            const results = await Promise.allSettled(
              fetchedNames.map((nm) =>
                useAxiosRepo(NftItem).api().fetchNftWithOwner('nameservice.dys', nm)
              )
            )
            for (const r of results) if (r.status === 'rejected') console.error(r.reason)
          }
          return { next_key: nextKey || undefined, total, returned, page, limit }
        },
      },
    },
  }
}

export default NamesByDestination
