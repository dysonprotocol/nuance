import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

export class NameResolution extends Model {
  static entity = 'nameservice_resolutions'
  static primaryKey = 'input'

  static fields() {
    return {
      input: this.string(''),
      address: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async resolve(this: Request, input: string) {
          const path = `/dysonprotocol/nameservice/v1/resolve_name/${encodeURIComponent(input)}`
          return this.get(path, {
            dataTransformer: ({ data }: { data: { address?: string } }) => {
              const address = String(data?.address || '')
              return [
                {
                  input,
                  address,
                },
              ]
            },
          })
        },
      },
    },
  }
}

export default NameResolution
