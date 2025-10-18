<template>
  <div ref="root">
    <div v-if="loading" class="h-2 bg-gray-200 rounded" />
    <div v-else class="text-xs">
      <span class="mr-2">▲ {{ up || 0 }}</span>
      <span>▼ {{ down || 0 }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useInView } from "@/composables/useInView";
import { useRatingsStore } from "@/stores/nuance/ratings.store";
import { pad15 } from "@/composables/useIndexBuilders";

const props = defineProps<{ owner: string; postId: number; replyId: number }>();
const ratings = useRatingsStore();
const loading = ref(true);

const tagName = computed(() => pad15(props.postId));

const root = useInView(async () => {
  await ratings.fetchCounts(props.owner, "replies", tagName.value, [
    props.replyId,
  ]);
  loading.value = false;
});

const counts = computed(
  () => ratings.getCounts("replies", tagName.value, props.replyId) || {}
);
const up = computed(() => counts.value.up || 0);
const down = computed(() => counts.value.down || 0);
</script>
