import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

export class ListAllInterfaces extends Model {
  static entity = 'base_reflection_interfaces'
  static primaryKey = 'name'

  static fields() {
    return {
      name: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request) {
          return this.get(`/cosmos/base/reflection/v1beta1/interfaces`, {
            dataTransformer: ({ data }: { data: { interface_names?: string[] } }) => {
              const names = Array.isArray(data?.interface_names) ? data.interface_names : []
              return names.map((n) => ({ name: n }))
            },
          })
        },
      },
    },
  }
}

export class ListImplementations extends Model {
  static entity = 'base_reflection_implementations'
  static primaryKey = 'type_url'

  static fields() {
    return {
      type_url: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request, interfaceName: string) {
          return this.get(
            `/cosmos/base/reflection/v1beta1/interfaces/${encodeURIComponent(
              interfaceName
            )}/implementations`,
            {
              dataTransformer: ({
                data,
              }: {
                data: { implementation_message_names?: string[] }
              }) => {
                const list = Array.isArray(data?.implementation_message_names)
                  ? data.implementation_message_names
                  : []
                return list.map((t) => ({ type_url: t }))
              },
            }
          )
        },
      },
    },
  }
}

export default ListAllInterfaces
