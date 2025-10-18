import { Model } from 'pinia-orm'
import type { Request } from '@pinia-orm/axios'

export class NodeConfig extends Model {
  static entity = 'base_node_config'
  static primaryKey = 'singleton'

  static fields() {
    return {
      singleton: this.string('default'),
      minimum_gas_price: this.string(''),
      pruning_keep_recent: this.string(''),
      pruning_interval: this.string(''),
      halt_height: this.string('0'),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request) {
          return this.get(`/cosmos/base/node/v1beta1/config`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                minimum_gas_price?: string
                pruning_keep_recent?: string
                pruning_interval?: string
                halt_height?: string | number
              }
            }) => [
              {
                singleton: 'default',
                minimum_gas_price: String(data?.minimum_gas_price || ''),
                pruning_keep_recent: String(data?.pruning_keep_recent || ''),
                pruning_interval: String(data?.pruning_interval || ''),
                halt_height: String(data?.halt_height ?? '0'),
              },
            ],
          })
        },
      },
    },
  }
}

export class NodeStatus extends Model {
  static entity = 'base_node_status'
  static primaryKey = 'singleton'

  static fields() {
    return {
      singleton: this.string('default'),
      earliest_store_height: this.string('0'),
      height: this.string('0'),
      timestamp: this.string(''),
      app_hash: this.string(''),
      validator_hash: this.string(''),
    }
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request) {
          return this.get(`/cosmos/base/node/v1beta1/status`, {
            dataTransformer: ({
              data,
            }: {
              data?: {
                earliest_store_height?: string | number
                height?: string | number
                timestamp?: string
                app_hash?: string
                validator_hash?: string
              }
            }) => [
              {
                singleton: 'default',
                earliest_store_height: String(data?.earliest_store_height ?? '0'),
                height: String(data?.height ?? '0'),
                timestamp: String(data?.timestamp || ''),
                app_hash: String(data?.app_hash || ''),
                validator_hash: String(data?.validator_hash || ''),
              },
            ],
          })
        },
      },
    },
  }
}

export default NodeStatus
