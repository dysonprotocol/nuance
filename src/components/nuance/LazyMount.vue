<template>
  <div ref="root">
    <slot v-if="isShown" />
    <div v-else class="opacity-60 text-xs py-2">Loading…</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useInView } from "@/composables/useInView";

const isShown = ref(false);
const root = useInView(
  () => {
    isShown.value = true;
  },
  { rootMargin: "200px" }
);
</script>
