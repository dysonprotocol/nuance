<template>
  <Tooltip :text="tooltipText">
    <span
      :title="address"
      class="font-mono cursor-pointer hover:text-primary text-xs break-all"
      @click="copy"
    >
      {{
        truncate && truncate < address.length / 2
          ? `${address.slice(0, truncate + 5)}...${address.slice(-truncate)}`
          : address
      }}
    </span>
  </Tooltip>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import Tooltip from '@/components/shared/Tooltip.vue'

const { address, truncate } = defineProps({
  address: String,
  truncate: { type: Number, default: false },
})

const tooltipText = ref('copy address')
let resetTimerId = null

function copy() {
  navigator.clipboard.writeText(address)
  tooltipText.value = 'copied'

  if (resetTimerId) clearTimeout(resetTimerId)
  resetTimerId = setTimeout(() => {
    tooltipText.value = 'copy address'
    resetTimerId = null
  }, 1000)
}

onBeforeUnmount(() => {
  if (resetTimerId) clearTimeout(resetTimerId)
})
</script>
