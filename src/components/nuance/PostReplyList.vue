<template>
  <section class="mt-6">
    <h3 class="text-sm font-semibold mb-2 text-center">Replies</h3>
    <div
      class="text-center mb-3 text-sm"
      role="tablist"
      aria-label="Reply sort"
    >
      <button
        class="underline mr-2"
        :class="{ 'font-bold': sortMode === 'hot' }"
        @click="$emit('setMode', 'hot')"
        role="tab"
        :aria-selected="sortMode === 'hot'"
      >
        Hot
      </button>
      <button
        class="underline"
        :class="{ 'font-bold': sortMode === 'best' }"
        @click="$emit('setMode', 'best')"
        role="tab"
        :aria-selected="sortMode === 'best'"
      >
        Best
      </button>
    </div>
    <div
      v-if="items.length === 0 && !hasNext && !isLoading"
      class="text-sm opacity-70"
    >
      No replies yet
    </div>
    <div class="space-y-4">
      <PostReply
        v-for="r in items"
        :key="r.id"
        :post-id="postId"
        :reply-id="r.id"
        :post="r.post"
        :up="r.up"
        :down="r.down"
        :metadata="r.metadata"
        :earliest-claim-time="r.earliestClaimTime"
        :hot-index="r.hotIndex"
        :available-udys="(r as any).availableUdys"
        @rated="$emit('rated', r.id)"
        @claim="$emit('claim', r.id)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import {} from "vue";
import PostReply from "@/components/nuance/PostReply.vue";

defineProps<{
  postId: number;
  items: Array<{
    id: number;
    post: {
      postId: number;
      author: string;
      content: string;
      createdTime: string | number;
      claimedUdys?: number;
    };
    up?: number;
    down?: number;
    metadata?: Record<string, unknown>;
    earliestClaimTime?: number;
    hotIndex?: number;
    availableUdys?: number;
  }>;
  sortMode: "best" | "hot";
  isLoading?: boolean;
  hasNext?: boolean;
}>();

defineEmits(["setMode", "rated", "claim"]);
</script>
