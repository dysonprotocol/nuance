<template>
  <ScriptFunctionItem
    v-for="fn in functions"
    :key="fn.function_name"
    :func="fn"
    :address="address"
    :has-unsaved-changes="hasUnsavedChanges"
    @focus-code="$emit('focus-code')"
  />
</template>

<script setup lang="ts">
import ScriptFunctionItem from './ScriptFunctionItem.vue'

defineProps<{ functions: any[]; address: string; hasUnsavedChanges?: boolean }>()
defineEmits(['focus-code'])
</script>
