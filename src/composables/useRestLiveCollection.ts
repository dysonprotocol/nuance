/* eslint-env browser */
import { computed, toValue, watchEffect, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { createCollection, type Collection } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/vue-db'
import {
  useRestResource,
  type UseRestResourceOptions,
  type UseRestResourceResult,
} from './useRestResource'

type MaybeRef<T> = T | MaybeRefOrGetter<T>

export interface UseRestLiveCollectionOptions<TRaw, TItem, TKey extends string | number> {
  id?: string
  pathTemplate: MaybeRef<string>
  params?: MaybeRef<Record<string, unknown> | undefined>
  apiBase?: MaybeRef<string | undefined>
  enabled?: MaybeRef<boolean>
  selectItems: (raw: TRaw) => readonly TItem[]
  getKey: (item: TItem) => TKey
  queryOptions?: UseRestResourceOptions<TRaw>['queryOptions']
  gcTime?: number
}

export interface UseRestLiveCollectionReturn<TRaw> {
  resource: UseRestResourceResult<TRaw>
  collection: ComputedRef<Collection<any, any, any>>
  useQuery: (
    builder: (q: any) => any,
    deps?: Array<MaybeRefOrGetter<unknown>>
  ) => ReturnType<typeof useLiveQuery<any>>
}

export function useRestLiveCollection<
  TRaw = unknown,
  TItem extends object = any,
  TKey extends string | number = string
>(options: UseRestLiveCollectionOptions<TRaw, TItem, TKey>): UseRestLiveCollectionReturn<TRaw> {
  const { pathTemplate, params, apiBase, enabled, selectItems, getKey } = options

  const resource = useRestResource<TRaw>(pathTemplate as any, params as any, {
    apiBase: apiBase as any,
    enabled: enabled as any,
    queryOptions: options.queryOptions,
  })

  let syncApi: null | {
    collection: Collection<any, any, any>
    begin: () => void
    write: (msg: { type: 'insert' | 'update' | 'delete'; value?: any }) => void
    commit: () => void
    markReady: () => void
    truncate: () => void
  } = null

  const collection = createCollection<any, any, Record<string, unknown>>({
    id: options.id || `rest:${String(toValue(pathTemplate))}`,
    getKey: getKey as any,
    startSync: true,
    gcTime: options.gcTime ?? 5000,
    sync: {
      sync: (params) => {
        syncApi = params as typeof syncApi
      },
    },
  }) as Collection<any, any, any>

  // Ensure sync starts immediately so the collection is a valid query source
  try {
    ;(collection as any).startSyncImmediate?.()
  } catch (e) {
    // bubble in dev console; do not catch/ignore silently

    console.error(e)
  }

  watchEffect(() => {
    const raw = resource.data.value
    if (raw == null || !syncApi) return
    const items = selectItems(raw) || []

    const nextByKey = new Map<TKey, TItem>()
    for (const item of items) {
      const key = getKey(item)
      nextByKey.set(key, item)
    }

    const prevByKey = new Map<any, any>()
    for (const [k, v] of (collection as any).entries()) prevByKey.set(k, v)

    syncApi.begin()
    // Deletes
    for (const [key] of prevByKey.entries()) {
      if (!nextByKey.has(key as TKey)) {
        const w = (syncApi as any).write
        if (typeof w === 'function' && w.length >= 2) w(key, { type: 'delete' })
        else w({ type: 'delete' })
      }
    }
    // Inserts/Updates
    for (const [key, next] of nextByKey.entries()) {
      if (prevByKey.has(key)) {
        const prev = prevByKey.get(key)
        if (!shallowEqual(prev, next)) {
          const w = (syncApi as any).write
          if (typeof w === 'function' && w.length >= 2) w(key, { type: 'update', value: next })
          else w({ type: 'update', value: next as any })
        }
      } else {
        const w = (syncApi as any).write
        if (typeof w === 'function' && w.length >= 2) w(key, { type: 'insert', value: next })
        else w({ type: 'insert', value: next as any })
      }
    }
    syncApi.commit()
    syncApi.markReady()
  })

  function useQuery(builder: (q: any) => any, deps: Array<MaybeRefOrGetter<unknown>> = []) {
    return useLiveQuery((q) => builder(q), deps)
  }

  return {
    resource,
    collection: computed(() => collection as any),
    useQuery,
  }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) if (aObj[k] !== bObj[k]) return false
  return true
}
