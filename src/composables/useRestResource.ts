/* eslint-env browser */
import { computed, unref, type Ref, type ComputedRef } from 'vue'
import { useQuery, type UseQueryOptions } from '@tanstack/vue-query'
import axios from 'axios'

type MaybeRef<T> = T | Ref<T>

export interface UseRestResourceOptions<TData = unknown> {
  enabled?: MaybeRef<boolean>
  debounceMs?: number
  apiBase?: MaybeRef<string | undefined>
  select?: (data: unknown) => TData
  queryOptions?: Omit<
    UseQueryOptions<TData, unknown, TData, unknown[]>,
    'queryKey' | 'queryFn' | 'enabled' | 'initialData' | 'staleTime' | 'select'
  >
}

export interface UseRestResourceResult<TData> {
  data: ComputedRef<TData | undefined>
  error: ComputedRef<unknown>
  isError: ComputedRef<boolean>
  failureReason: ComputedRef<unknown>
  isLoading: ComputedRef<boolean>
  isFetching: ComputedRef<boolean>
  refetch: () => void
  url: ComputedRef<string>
  queryKey: ComputedRef<unknown[]>
}

export function useRestResource<TData = unknown>(
  pathTemplate: MaybeRef<string>,
  params: MaybeRef<Record<string, unknown> | undefined> = undefined,
  options: UseRestResourceOptions<TData> = {}
): UseRestResourceResult<TData> {
  const apiBase = computed(() => {
    const explicit = unref(options.apiBase)
    if (explicit) return explicit
    const fromGlobal = resolveRestBase()
    if (fromGlobal) return fromGlobal
    return ''
  })

  const paramsJson = computed(() => JSON.stringify(unref(params)))

  const queryKey = computed(() => ['rest', apiBase.value, unref(pathTemplate), paramsJson.value])

  const url = computed(() => {
    // depend on deep changes of params via the stringified snapshot
    void paramsJson.value
    return buildUrl(
      apiBase.value,
      unref(pathTemplate),
      unref(params) as Record<string, unknown> | undefined
    )
  })

  const isEnabled = computed(() => {
    const tpl = String(unref(pathTemplate)).trim()
    const userEnabled = options.enabled == null ? true : Boolean(unref(options.enabled))
    return Boolean(apiBase.value && tpl && userEnabled)
  })

  const query = useQuery<TData>({
    queryKey,
    queryFn: async ({ signal }) => {
      const { data } = await axios.get(url.value, { signal })
      return (options.select ? options.select(data) : (data as TData)) as TData
    },
    enabled: isEnabled,
    // Disable caching: always stale and no cache retention when unused
    staleTime: 0,
    gcTime: 0,
    ...options.queryOptions,
  })

  return {
    data: computed(() => query.data.value as TData | undefined),
    error: computed(() => query.error.value),
    isError: computed(() => query.isError.value),
    failureReason: computed(
      () =>
        (query as unknown as { failureReason?: { value: unknown } }).failureReason?.value ??
        query.error.value
    ),
    isLoading: computed(() => query.isLoading.value),
    isFetching: computed(() => query.isFetching.value),
    refetch: () => query.refetch(),
    url,
    queryKey,
  }
}

function buildUrl(base: string, template: string, params?: Record<string, unknown>): string {
  const usedKeys = new Set<string>()
  const path = template.replace(/\{(\w+)\}/g, (_m: string, key: string) => {
    usedKeys.add(key)
    const value = params?.[key]
    return value == null ? '' : encodeURIComponent(String(value))
  })

  const search = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (usedKeys.has(key) || value == null) continue
      if (Array.isArray(value)) {
        for (const v of value) if (v != null) search.append(key, String(v))
      } else {
        search.set(key, String(value))
      }
    }
  }
  const qs = search.toString()
  return `${base}${path}?${qs}`
}

function resolveRestBase(): string {
  const w = globalThis as { resolveRestUrl?: () => string } | undefined
  if (w && typeof w.resolveRestUrl === 'function') return w.resolveRestUrl()
  return ''
}
