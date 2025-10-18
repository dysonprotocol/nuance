import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'
import { useAxiosRepo } from '@pinia-orm/axios'
import ScriptParams from './Params'
import { parseScriptFunctions, extractDocstring } from '../../../utils/pythonParser.js'

type ScriptResponse = {
  script?: {
    address?: string
    version?: string | number
    code?: string
    update_height?: string | number
  }
}

export class Script extends Model {
  static entity = 'script_info'
  static primaryKey = 'address'

  static fields() {
    return {
      address: this.string(''),
      version: this.string('0'),
      code: this.string(''),
      update_height: this.string('0'),
      functions: this.attr([]),
      docstring: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        // Local types for wallet bridge
        // NOTE: The wallet composable is JavaScript; we define minimal TypeScript facades here
        // to avoid 'any' while preserving the actual runtime shape.
        // Keep these narrow to what we call from here.
        // Args for wallet.runDysonScript
        // Internal: access configured axios instance without ORM persistence
        // Note: Request from pinia-orm/axios exposes an axios instance
        async fetchInfo(this: Request, address: string) {
          return this.get(`/dysonprotocol/script/v1/script_info/${encodeURIComponent(address)}`, {
            dataTransformer: ({ data }: { data: ScriptResponse }) => {
              const s = data?.script || {}
              const addr = String(s?.address || address || '')
              if (!addr) return []
              const codeStr = String(s?.code ?? '')
              const functions: unknown[] =
                (parseScriptFunctions as (src: string) => unknown[])(codeStr) || []
              const docstring = (extractDocstring as (src: string | undefined | null) => string)(
                codeStr
              )
              return [
                {
                  address: addr,
                  version: String(s?.version ?? '0'),
                  code: codeStr,
                  update_height: String(s?.update_height ?? '0'),
                  functions,
                  docstring,
                },
              ]
            },
          })
        },
        async fetchParams() {
          return useAxiosRepo(ScriptParams).api().fetch()
        },
        async encodeJson(this: Request, json: string): Promise<Uint8Array | string> {
          const qs = new URLSearchParams({ json })
          type HttpClient = {
            get: (url: string, config?: unknown) => Promise<{ data: unknown }>
            post: (url: string, data?: unknown, config?: unknown) => Promise<{ data: unknown }>
          }
          const client = (this as unknown as { axios: HttpClient }).axios
          const resp = await client.get(`/dysonprotocol/script/v1/encode_json?${qs}`)
          const d = resp?.data as { bytes?: string } | undefined
          return d?.bytes ?? ''
        },
        async decodeBytes(
          this: Request,
          params: { type_url: string; bytes: string }
        ): Promise<string> {
          const { type_url, bytes } = params
          const qs = new URLSearchParams({ type_url, bytes })
          type HttpClient = {
            get: (url: string, config?: unknown) => Promise<{ data: unknown }>
          }
          const client = (this as unknown as { axios: HttpClient }).axios
          const resp = await client.get(`/dysonprotocol/script/v1/decode_bytes?${qs}`)
          const d = resp?.data as { json?: string } | undefined
          return String(d?.json ?? '')
        },
        async verifyTx(this: Request, tx_json: string): Promise<string> {
          const qs = new URLSearchParams({ tx_json })
          type HttpClient = {
            get: (url: string, config?: unknown) => Promise<{ data: unknown }>
          }
          const client = (this as unknown as { axios: HttpClient }).axios
          const resp = await client.get(`/dysonprotocol/script/v1/verify_tx?${qs}`)
          const d = resp?.data as { signer?: string } | undefined
          return String(d?.signer || '')
        },
        async web(
          this: Request,
          params: { script_address: string; script_name?: string; httprequest: string }
        ): Promise<string> {
          const { script_address, script_name, httprequest } = params
          const payload: Record<string, unknown> = { httprequest }
          const addr = (script_address || '').trim()
          const name = (script_name || '').trim()
          if (addr) payload.script_address = addr
          if (name) payload.script_name = name
          type HttpClient = {
            post: (url: string, data?: unknown, config?: unknown) => Promise<{ data: unknown }>
          }
          const client = (this as unknown as { axios: HttpClient }).axios
          const resp = await client.post(`/dysonprotocol/script/v1/web_request`, payload)
          const d = resp?.data as { httpresponse?: string } | undefined
          return String(d?.httpresponse || '')
        },
        async runDysonScript(
          this: Request,
          params: {
            scriptAddress: string
            functionName: string
            args?: string
            kwargs?: string
            extraCode?: string
            attachedMsg?: unknown[]
            memo?: string
            gasLimit?: number | 'auto'
            simulate?: boolean
            executorAddress: string
            grantee?: string
          }
        ) {
          type WalletRunDysonArgs = {
            scriptAddress: string
            functionName: string
            args?: string
            kwargs?: string
            extraCode?: string
            attachedMsg?: unknown[]
            memo?: string
            gasLimit?: number | 'auto'
            simulate?: boolean
            executorAddress: string
            grantee?: string
          }
          type WalletRunDysonResult = {
            kind?: string
            success: boolean
            scriptResponse: unknown
            rawSendMsgsResponse: unknown
          }
          type WalletModule = {
            useWallet: () => {
              runDysonScript: (a: WalletRunDysonArgs) => Promise<WalletRunDysonResult>
            }
          }
          const mod = (await import('@/composables/useWallet.js')) as unknown as WalletModule
          const wallet = mod.useWallet()
          return wallet.runDysonScript({
            scriptAddress: params.scriptAddress,
            functionName: params.functionName,
            args: params.args ?? '',
            kwargs: params.kwargs ?? '',
            extraCode: params.extraCode ?? '',
            attachedMsg: params.attachedMsg ?? [],
            memo: params.memo ?? '',
            gasLimit: params.gasLimit ?? 100000000,
            simulate: Boolean(params.simulate),
            executorAddress: params.executorAddress,
            grantee: params.grantee,
          } as WalletRunDysonArgs)
        },
        async run(
          this: Request,
          params: {
            executor_address: string
            script_address?: string
            script_name?: string
            extra_code?: string
            function_name: string
            args?: unknown[] | string
            kwargs?: Record<string, unknown> | string
            attached_messages?: unknown[]
          }
        ): Promise<string> {
          const body = {
            executor_address: params.executor_address,
            script_address: params.script_address,
            script_name: params.script_name,
            extra_code: params.extra_code,
            function_name: params.function_name,
            args:
              typeof params.args === 'string'
                ? params.args
                : JSON.stringify(Array.isArray(params.args) ? params.args : []),
            kwargs:
              typeof params.kwargs === 'string'
                ? params.kwargs
                : JSON.stringify(params.kwargs || {}),
            attached_messages: params.attached_messages,
          }
          type HttpClient = {
            post: (url: string, data?: unknown, config?: unknown) => Promise<{ data: unknown }>
          }
          const client = (this as unknown as { axios: HttpClient }).axios
          const resp = await client.post(`/dysonprotocol/script/v1/run`, body)
          const d = resp?.data as { result?: string } | undefined
          return String(d?.result || '')
        },
        async updateScript(
          this: Request,
          params: {
            address: string
            code: string
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
          const { address, code, wallet, gasLimit, memo } = params
          const msg = {
            '@type': '/dysonprotocol.script.v1.MsgUpdateScript',
            address,
            code,
          }
          const res = await wallet.sendMsg({ msg, gasLimit, memo, executorAddress: address })
          if (!res?.success) throw new Error(res?.rawLog || 'Update script failed')
          await this.fetchInfo(address)
          return res
        },
        async exec(
          this: Request,
          params: {
            executor_address: string
            script_address?: string
            script_name?: string
            function_name: string
            args?: string
            kwargs?: string
            extra_code?: string
            attached_messages?: unknown[]
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
          const msg = {
            '@type': '/dysonprotocol.script.v1.MsgExec',
            executor_address: params.executor_address,
            script_address: params.script_address,
            script_name: params.script_name,
            function_name: params.function_name,
            args: params.args,
            kwargs: params.kwargs,
            extra_code: params.extra_code,
            attached_messages: params.attached_messages,
          }
          const res = await params.wallet.sendMsg({
            msg,
            gasLimit: params.gasLimit,
            memo: params.memo,
            executorAddress: params.executor_address,
          })
          if (!res?.success) throw new Error(res?.rawLog || 'Exec script failed')
          return res
        },
        async createNewScript(
          this: Request,
          params: {
            creator_address: string
            code: string
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
          const { creator_address, code, wallet, gasLimit, memo } = params
          const msg = {
            '@type': '/dysonprotocol.script.v1.MsgCreateNewScript',
            creator_address,
            code,
          }
          const res = await wallet.sendMsg({
            msg,
            gasLimit,
            memo,
            executorAddress: creator_address,
          })
          if (!res?.success) throw new Error(res?.rawLog || 'Create script failed')
          return res
        },
        async updateParams(
          this: Request,
          params: {
            authority: string
            params: unknown
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
          const { authority, params: newParams, wallet, gasLimit, memo } = params
          const msg = {
            '@type': '/dysonprotocol.script.v1.MsgUpdateParams',
            authority,
            params: newParams,
          }
          const res = await wallet.sendMsg({ msg, gasLimit, memo, executorAddress: authority })
          if (!res?.success) throw new Error(res?.rawLog || 'Update params failed')
          await useAxiosRepo(ScriptParams).api().fetch()
          return res
        },
      },
    },
  }
}

export default Script
