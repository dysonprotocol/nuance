import { useAxiosRepo } from '@pinia-orm/axios'
import { useRepo } from 'pinia-orm'
import CrontaskTask from '@/orm/models/crontask/Task'
import CrontaskMetrics from '@/orm/models/crontask/Metrics'

const EVENTS = [
  'dysonprotocol.crontask.v1.EventTaskCreated',
  'dysonprotocol.crontask.v1.EventTaskExecuted',
  'dysonprotocol.crontask.v1.EventTaskFailed',
  'dysonprotocol.crontask.v1.EventTaskExpired',
  'dysonprotocol.crontask.v1.EventTaskPurged',
  'dysonprotocol.crontask.v1.EventTaskPending',
  'dysonprotocol.crontask.v1.EventTaskDeleted',
  'dysonprotocol.crontask.v1.EventCrontaskMetrics',
] as const

export type CrontaskEventName = (typeof EVENTS)[number]

interface CrontaskEventLike {
  type: CrontaskEventName
  detail?: Record<string, unknown>
}

interface GlobalWithEventListeners {
  addEventListener: (name: CrontaskEventName, handler: (ev: CrontaskEventLike) => void) => void
  removeEventListener: (name: CrontaskEventName, handler: (ev: CrontaskEventLike) => void) => void
}

let globalInitialized = false

export function unwrap(val: unknown): string {
  if (val == null) return ''
  const s = String(val).trim()
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s)
    } catch {
      // fall through
      console.error('[crontask.sync] unwrap error', s)
    }
  }
  return s.replace(/^"|"$/g, '')
}

function fetchTaskById(taskId: string) {
  const api = useAxiosRepo(CrontaskTask).api()
  // add cache-busting query to always fetch fresh data on event
  return api.fetchByID(`${taskId}?_cb=${Date.now()}`)
}

function hasTaskInRepo(taskId: string): boolean {
  const repo = useRepo(CrontaskTask)
  return !!repo.find(String(taskId))
}

export function ensureGlobalCrontaskEventSync(args: {
  isKnownCreator: (address: string) => boolean
}): void {
  if (globalInitialized) return
  globalInitialized = true
  const { isKnownCreator } = args

  const handler = (ev: CrontaskEventLike) => {
    try {
      const detail = ev.detail || undefined
      if (ev.type === 'dysonprotocol.crontask.v1.EventCrontaskMetrics') {
        // Save metrics singleton directly from event detail
        try {
          const repo = useRepo(CrontaskMetrics)
          const executed_total_gas = unwrap(detail?.executed_total_gas)
          const executed_task_count = unwrap(detail?.executed_task_count)
          const pending_task_count = unwrap(detail?.pending_task_count)
          const pending_gas_requested = unwrap(detail?.pending_gas_requested)
          const pending_oldest_scheduled_ts = unwrap(detail?.pending_oldest_scheduled_ts)
          const mode = unwrap(detail?.mode)
          // fees can be JSON array string; try parse
          let executed_total_fees: Array<{ denom: string; amount: string }> = []
          let pending_total_gas_fees: Array<{ denom: string; amount: string }> = []
          const feesRaw = detail?.executed_total_fees
          if (typeof feesRaw === 'string') {
            try {
              const parsed = JSON.parse(unwrap(feesRaw))
              if (Array.isArray(parsed)) {
                executed_total_fees = (parsed as Array<unknown>)
                  .map((v) =>
                    v && typeof v === 'object' ? (v as { denom?: unknown; amount?: unknown }) : null
                  )
                  .filter((v): v is { denom?: unknown; amount?: unknown } => !!v)
                  .map((v) => ({ denom: String(v.denom ?? ''), amount: String(v.amount ?? '0') }))
              }
            } catch (e) {
              console.error('[crontask.sync] metrics fees parse error', e)
            }
          } else if (Array.isArray(feesRaw)) {
            executed_total_fees = (feesRaw as Array<unknown>)
              .map((v) =>
                v && typeof v === 'object' ? (v as { denom?: unknown; amount?: unknown }) : null
              )
              .filter((v): v is { denom?: unknown; amount?: unknown } => !!v)
              .map((v) => ({ denom: String(v.denom ?? ''), amount: String(v.amount ?? '0') }))
          }
          // parse pending_total_gas_fees similarly
          const pfeesRaw = detail?.pending_total_gas_fees
          if (typeof pfeesRaw === 'string') {
            try {
              const parsed = JSON.parse(unwrap(pfeesRaw))
              if (Array.isArray(parsed)) {
                pending_total_gas_fees = (parsed as Array<unknown>)
                  .map((v) =>
                    v && typeof v === 'object' ? (v as { denom?: unknown; amount?: unknown }) : null
                  )
                  .filter((v): v is { denom?: unknown; amount?: unknown } => !!v)
                  .map((v) => ({ denom: String(v.denom ?? ''), amount: String(v.amount ?? '0') }))
              }
            } catch (e) {
              console.error('[crontask.sync] metrics pending fees parse error', e)
            }
          } else if (Array.isArray(pfeesRaw)) {
            pending_total_gas_fees = (pfeesRaw as Array<unknown>)
              .map((v) =>
                v && typeof v === 'object' ? (v as { denom?: unknown; amount?: unknown }) : null
              )
              .filter((v): v is { denom?: unknown; amount?: unknown } => !!v)
              .map((v) => ({ denom: String(v.denom ?? ''), amount: String(v.amount ?? '0') }))
          }
          repo.save({
            default: 'default',
            executed_total_gas,
            executed_total_fees,
            executed_task_count,
            pending_task_count,
            pending_gas_requested,
            pending_oldest_scheduled_ts,
            pending_total_gas_fees,
            mode,
          })
        } catch (e) {
          console.error('[crontask.sync] metrics save error', e)
        }
        return
      }

      const taskId = unwrap(detail?.task_id)
      if (!taskId) return
      const creator = unwrap(detail?.creator)

      if (!hasTaskInRepo(taskId) && !isKnownCreator(creator)) return

      // log the task id and event for debugging
      console.log('[crontask.sync] task id event', { taskId, creator, event: ev.type })

      fetchTaskById(taskId).catch((e: unknown) => {
        console.error('[crontask.sync] fetch error', { taskId, error: e })
      })
    } catch (e) {
      console.error('[crontask.sync] handler error', e)
    }
  }

  const g = globalThis as unknown as GlobalWithEventListeners
  for (const name of EVENTS) g.addEventListener(name, handler)
}

export function subscribeAllCrontaskEvents(
  onEvent: (name: CrontaskEventName, detail: Record<string, unknown>) => void
): () => void {
  const handler = (ev: CrontaskEventLike) => {
    try {
      const detail = ev.detail || undefined
      if (!detail) return
      onEvent(ev.type, detail)
    } catch (e) {
      console.error('[crontask.view] handler error', e)
    }
  }
  const g = globalThis as unknown as GlobalWithEventListeners
  for (const name of EVENTS) g.addEventListener(name, handler)
  return () => {
    for (const name of EVENTS) g.removeEventListener(name, handler)
  }
}
