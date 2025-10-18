import { Model, useRepo } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type DenomUnit = { denom: string; exponent: number; aliases?: string[] }
type Metadata = {
  description?: string
  denom_units?: DenomUnit[]
  base?: string
  display?: string
  name?: string
  symbol?: string
  uri?: string
  uri_hash?: string
}

export class DenomMetadata extends Model {
  static entity = 'denoms_metadata'
  static primaryKey = 'base'

  static fields() {
    return {
      base: this.string(''),
      description: this.string(''),
      display: this.string(''),
      name: this.string(''),
      symbol: this.string(''),
      uri: this.string(''),
      uri_hash: this.string(''),
      denom_units: this.attr([] as DenomUnit[]),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchAll(this: Request) {
          return this.get(`/cosmos/bank/v1beta1/denoms_metadata`, {
            params: { 'pagination.limit': 1000 },
            dataTransformer: ({ data }: { data: { metadatas?: Metadata[] } }) =>
              (Array.isArray(data?.metadatas) ? data.metadatas : []).map((m) => ({
                base: m.base || '',
                description: m.description || '',
                display: m.display || '',
                name: m.name || '',
                symbol: m.symbol || '',
                uri: m.uri || '',
                uri_hash: m.uri_hash || '',
                denom_units: Array.isArray(m.denom_units) ? m.denom_units : [],
              })),
          })
        },
        async fetchOne(this: Request, denom: string) {
          return this.get(`/cosmos/bank/v1beta1/denoms_metadata/${encodeURIComponent(denom)}`, {
            dataTransformer: ({ data }: { data: { metadata?: Metadata } }) => {
              const m = data?.metadata
              return m
                ? [
                    {
                      base: m.base || '',
                      description: m.description || '',
                      display: m.display || '',
                      name: m.name || '',
                      symbol: m.symbol || '',
                      uri: m.uri || '',
                      uri_hash: m.uri_hash || '',
                      denom_units: Array.isArray(m.denom_units) ? m.denom_units : [],
                    },
                  ]
                : []
            },
          })
        },
      },
    },
  }

  // Intentionally no cache controls; callers can refetch via api().fetchAll()

  static getOptions(args: { allowedBases?: string[] } = {}) {
    const allowed = Array.isArray(args.allowedBases) ? args.allowedBases : []
    const list = useRepo(DenomMetadata).all() as unknown as Array<{
      base: string
      display: string
      name: string
      denom_units: Array<{ denom: string; exponent: number; aliases?: string[] }>
    }>
    const bases = allowed.length > 0 ? allowed : list.map((m) => m.base)
    const out: Array<{ display: string; name: string; base: string; exponent: number }> = []
    for (const base of bases) {
      const md = list.find((m) => m.base === base)
      if (!md) {
        out.push({ display: base, name: base, base, exponent: 0 })
        continue
      }
      const display = md.display || base
      const unit = (md.denom_units || []).find(
        (u) => u.denom === display || (u.aliases || []).includes(display)
      )
      const exponent = Number(unit?.exponent || 0)
      out.push({ display, name: md.name || display || base, base, exponent })
    }
    return out
  }

  static normalize(args: { amount: string | number | bigint; denom: string }) {
    const denom = String(args.denom || '')
    const rawAmount = args.amount as unknown

    // Build quick lookup over metadata units
    const all = useRepo(DenomMetadata).all() as unknown as Array<{
      base: string
      display: string
      denom_units: Array<{ denom: string; exponent: number; aliases?: string[] }>
      name?: string
    }>

    let metadata: (typeof all)[number] | null = null
    let inputUnit: { denom: string; exponent: number; aliases?: string[] } | null = null
    for (const md of all) {
      for (const unit of md.denom_units || []) {
        if (unit.denom === denom || (unit.aliases || []).includes(denom)) {
          metadata = md
          inputUnit = unit
          break
        }
      }
      if (metadata) break
    }

    // Unknown denom fallback: exponent 0 passthrough
    if (!metadata || !inputUnit) {
      const amountStr =
        typeof rawAmount === 'bigint' ? rawAmount.toString() : String(rawAmount || '0')
      const baseAmount = BigInt(
        amountStr.includes('.') ? amountStr.replace(/\..*$/, '') : amountStr
      )
      const baseDenom = denom
      return {
        base: { amount: baseAmount.toString(), denom: baseDenom },
        display: { amount: baseAmount.toString(), denom: baseDenom },
        metadata: {
          base: baseDenom,
          display: baseDenom,
          denom_units: [{ denom: baseDenom, exponent: 0 }],
          name: baseDenom,
        },
      }
    }

    const inputExp = Number(inputUnit.exponent || 0)
    const amountStr =
      typeof rawAmount === 'bigint' ? rawAmount.toString() : String(rawAmount || '0').trim()

    // Convert input amount (possibly decimal) in input unit -> base integer
    let baseAmount: bigint
    if (amountStr.includes('.')) {
      const [a, bRaw = ''] = amountStr.split('.')
      const frac = bRaw.slice(0, inputExp)
      const pad = Math.max(0, inputExp - frac.length)
      const baseStr = (a || '0') + (frac + '0'.repeat(pad))
      baseAmount = BigInt(baseStr || '0')
    } else {
      baseAmount = BigInt(amountStr || '0') * 10n ** BigInt(inputExp)
    }

    const baseDenom = metadata.base

    // Compute display amount (decimal string) using metadata.display
    const displayDenom = metadata.display || baseDenom
    const displayUnit = (metadata.denom_units || []).find(
      (u) => u.denom === displayDenom || (u.aliases || []).includes(displayDenom)
    )
    const displayExp = Number(displayUnit?.exponent || 0)
    let displayAmountStr = baseAmount.toString()
    if (displayExp > 0) {
      const scale = 10n ** BigInt(displayExp)
      const intPart = baseAmount / scale
      const fracPart = baseAmount % scale
      if (fracPart === 0n) displayAmountStr = intPart.toString()
      else {
        const fracPadded = fracPart.toString().padStart(displayExp, '0').replace(/0+$/, '')
        displayAmountStr = `${intPart.toString()}.${fracPadded}`
      }
    }

    return {
      base: { amount: baseAmount.toString(), denom: baseDenom },
      display: { amount: displayAmountStr, denom: displayDenom },
      metadata,
    }
  }
}

export default DenomMetadata
