import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

type ParamsShape = {
  params?: {
    max_relative_historical_blocks?: string | number
    absolute_historical_block_cutoff?: string | number
  }
}

export class ScriptParams extends Model {
  static entity = 'script_params'
  static primaryKey = 'default'

  static fields() {
    return {
      default: this.string('default'),
      max_relative_historical_blocks: this.string('0'),
      absolute_historical_block_cutoff: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request) {
          return this.get(`/dysonprotocol/script/v1/params`, {
            dataTransformer: ({ data }: { data: ParamsShape }) => {
              const p = data?.params || {}
              return [
                {
                  default: 'default',
                  max_relative_historical_blocks: String(p?.max_relative_historical_blocks ?? '0'),
                  absolute_historical_block_cutoff: String(
                    p?.absolute_historical_block_cutoff ?? '0'
                  ),
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default ScriptParams
