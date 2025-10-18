<template>
  <div class="border rounded p-2">
    <div class="font-mono text-sm">
      {{ fn.function_name }}(<span>{{ paramList }}</span>)
    </div>
    <div
      v-if="fn.docstring"
      class="text-xs text-muted-foreground mt-1"
    >
      {{ fn.docstring }}
    </div>
    <div class="text-xs text-muted-foreground mt-1">
      {{ fn.kwargs }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ fn: any }>()

const paramList = computed(() => {
  const params = props.fn.parameters || []
  return params.map((p: any) => (p.required ? p.name : `${p.name}=${String(p.default)}`)).join(', ')
})
</script>
