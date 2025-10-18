<template>
  <div class="post-reply">
    <NuancePost :post-id="replyId" :depth="0" class="border p-4 mt-2" />
    <VoteBar
      mode="reply"
      :post-id="postId"
      :reply-id="replyId"
      :up="effectiveUp()"
      :down="effectiveDown()"
      claim-mode="reply"
      :author="author"
      :earliest-claim-time="earliestClaimTime"
      :hot-index="hotIndex"
      :available-udys="availableUdys"
      @rated="$emit('rated')"
      @claim="$emit('claim')"
    />
  </div>
</template>

<script setup lang="ts">
import NuancePost from "@/components/nuance/NuancePost.vue";
import VoteBar from "@/components/nuance/VoteBar.vue";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useRepliesStore } from "@/stores/nuance/replies.store";
import { ref } from "vue";
import { usePosts } from "@/composables/usePosts";
import { useInView } from "@/composables/useInView";

const props = defineProps<{
  postId: number;
  replyId: number;
  up?: number;
  down?: number;
  metadata?: Record<string, unknown>;
  earliestClaimTime?: number;
  hotIndex?: number;
  availableUdys?: number;
}>();

defineEmits(["rated", "claim"]);

const { nuanceOwner: owner } = useNuanceEnv();
const replies = useRepliesStore();
const { fetchById } = usePosts();
const author = ref("");

// Lazy load author when in view
useInView(async () => {
  const p = await fetchById(owner, props.replyId);
  if (p?.author) author.value = String(p.author);
});

function getUp(): number {
  return Number(replies.getCounts(props.postId, props.replyId)?.up || 0);
}

function getDown(): number {
  return Number(replies.getCounts(props.postId, props.replyId)?.down || 0);
}

function effectiveUp(): number {
  if (typeof props.up === "number") return Number(props.up || 0);
  return getUp();
}

function effectiveDown(): number {
  if (typeof props.down === "number") return Number(props.down || 0);
  return getDown();
}
</script>
