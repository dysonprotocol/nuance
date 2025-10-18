<template>
  <span
    :title="hash"
    :data-tip="tooltipText"
    class="tooltip font-mono cursor-pointer hover:text-primary text-xs"
    @click="copy"
  >
    {{
      truncate && truncate < hash.length
        ? `${hash.slice(0, truncate + 5)}...${hash.slice(-truncate)}`
        : hash
    }}
  </span>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'

const { hash, truncate } = defineProps({
  hash: { type: String, required: true },
  truncate: { type: Number, default: 0 },
})

const tooltipText = ref('copy tx hash')
let resetTimerId = null

function copy() {
  if (typeof window !== 'undefined' && window?.navigator?.clipboard) {
    window.navigator.clipboard.writeText(hash)
  }
  tooltipText.value = 'copied'

  if (resetTimerId) window.clearTimeout(resetTimerId)
  resetTimerId = window.setTimeout(() => {
    tooltipText.value = 'copy tx hash'
    resetTimerId = null
  }, 1000)
}

onBeforeUnmount(() => {
  if (resetTimerId) window.clearTimeout(resetTimerId)
})
</script>
