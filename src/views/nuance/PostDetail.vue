<template>
  <div class="max-w-3xl mx-auto">
    <div id="content">
      <h1 class="text-xl font-semibold text-center">Post #{{ postId }}</h1>
      <div class="text-xs text-center mt-1">
        <a href="#replies">Go to replies</a>
      </div>
      <div class="opacity-70" v-if="loading">Loading…</div>
      <NuancePost
        v-else-if="post"
        :post-id="post.postId"
        :depth="1"
        class="border p-4 my-4"
      />
      <div class="opacity-70" v-else>Post not found.</div>
    </div>
    <div id="replies" class="mt-6">
      <div class="text-xs text-center mb-2">
        <a href="#content">Go to content</a>
      </div>
      <hr />
      <div class="text-sm opacity-80 text-center my-2">
        <span>Rewards available:</span>
        <strong>{{ repliesAvailableDys }} DYS</strong>
        <span class="mx-1">|</span>
        <span>Claimed:</span>
        <strong>{{ repliesClaimedDys }} DYS</strong>
      </div>
      <PostReplyList
        :post-id="postId"
        :items="replyItems"
        :sort-mode="replySortMode"
        :is-loading="isLoadingReplies"
        :has-next="!!nextKeyReplies"
        @setMode="setReplyMode"
        @rated="refreshOneReply"
        @claim="handleClaimReply"
      />
      <div ref="repliesSentinel" class="h-6"></div>
      <div class="mt-2 text-xs opacity-70" v-if="isLoadingReplies">
        Loading…
      </div>
      <div
        class="mt-2 text-xs opacity-70"
        v-else-if="!nextKeyReplies && replyItems.length"
      >
        Fin.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import NuancePost from "@/components/nuance/NuancePost.vue";
import PostReplyList from "@/components/nuance/PostReplyList.vue";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { usePosts, type PostDto } from "@/composables/usePosts";
import { useRatingsStore } from "@/stores/nuance/ratings.store";
import { useRewardsStore } from "@/stores/nuance/rewards.store";
import { pad15 } from "@/composables/useIndexBuilders";

useNuanceEnv();
const route = useRoute();
const postId = computed(() => Number(route.params.postId));
const { nuanceOwner } = useNuanceEnv();
const { fetchById } = usePosts();

const post = ref<PostDto | null>(null);
const loading = ref(false);

async function load() {
  if (!postId.value) return;
  if (loading.value) return;
  loading.value = true;
  try {
    post.value = await fetchById(nuanceOwner, postId.value);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Replies fetching (view owns data)
const repliesSentinel = ref<null | any>(null);
const replyItems = ref<
  Array<{
    id: number;
    post: PostDto;
    up?: number;
    down?: number;
    metadata?: Record<string, unknown>;
    earliestClaimTime?: number;
    hotIndex?: number;
  }>
>([]);
const replySortMode = ref<"best" | "hot">("best");
const isLoadingReplies = ref(false);
const nextKeyReplies = ref<string | undefined>(undefined);

const ratingsStore = useRatingsStore();
const rewardsStore = useRewardsStore();
const replyTagName = computed(() => pad15(postId.value));

const repliesRewards = computed(() => rewardsStore.getReplies(postId.value));
const repliesAvailableUdys = computed(() =>
  Number(repliesRewards.value?.available?.udys || 0)
);
const repliesAvailableDys = computed(() =>
  Math.floor(repliesAvailableUdys.value / 1_000_000)
);
const repliesClaimedDys = computed(() =>
  Math.floor(Number(repliesRewards.value?.claimed?.udys || 0) / 1_000_000)
);

async function loadMoreReplies() {
  if (!postId.value) return;
  if (isLoadingReplies.value) return;
  isLoadingReplies.value = true;
  try {
    // Load reply rewards (available udys for this post's replies)
    await rewardsStore.fetchReplies(nuanceOwner, postId.value);
    const res = await ratingsStore.fetchList(
      nuanceOwner,
      "replies",
      replyTagName.value,
      replySortMode.value,
      5
    );
    await ratingsStore.fetchCounts(
      nuanceOwner,
      "replies",
      replyTagName.value,
      res.ids
    );
    // Ensure hot list (top 10) is available for claim top-10 checks
    const hotLen =
      ratingsStore.lists.get(`replies:${replyTagName.value}`)?.hot?.length || 0;
    if (hotLen < 10)
      await ratingsStore.fetchList(
        nuanceOwner,
        "replies",
        replyTagName.value,
        "hot",
        10
      );
    replyItems.value = ratingsStore
      .list("replies", replyTagName.value, replySortMode.value)
      .map((x: { id: number; post: PostDto; up?: number; down?: number }) => ({
        id: x.id,
        post: x.post,
        up: x.up,
        down: x.down,
        earliestClaimTime: getReplyEarliest(x.id),
        hotIndex: getReplyHotIndex(x.id),
        availableUdys: Number(
          rewardsStore.getReplies(postId.value)?.available?.udys || 0
        ),
      }));
    const page = ratingsStore.pagination.get(`replies:${replyTagName.value}`);
    nextKeyReplies.value =
      replySortMode.value === "hot" ? page?.hot?.nextKey : page?.best?.nextKey;
  } finally {
    isLoadingReplies.value = false;
  }
}

function setReplyMode(m: "best" | "hot") {
  if (replySortMode.value === m) return;
  replySortMode.value = m;
  replyItems.value = [];
  nextKeyReplies.value = undefined;
  void loadMoreReplies();
}

async function refreshOneReply(id: number) {
  await ratingsStore.fetchCounts(
    nuanceOwner,
    "replies",
    replyTagName.value,
    [id],
    { force: true }
  );
  // metadata now included in fetchCounts
  await rewardsStore.fetchReplies(nuanceOwner, postId.value);
  replyItems.value = ratingsStore
    .list("replies", replyTagName.value, replySortMode.value)
    .map((x: { id: number; post: PostDto; up?: number; down?: number }) => ({
      id: x.id,
      post: x.post,
      up: x.up,
      down: x.down,
      earliestClaimTime: getReplyEarliest(x.id),
      hotIndex: getReplyHotIndex(x.id),
      availableUdys: Number(
        rewardsStore.getReplies(postId.value)?.available?.udys || 0
      ),
    }));
}

function getReplyEarliest(id: number): number {
  return Number(
    ratingsStore.getCounts("replies", replyTagName.value, id)
      ?.earliestClaimTime || 0
  );
}

function getReplyHotIndex(id: number): number {
  return ratingsStore.getHotIndex("replies", replyTagName.value, id);
}

// async function resolveSelectedToAddress(): Promise<string> {
//   const sel: string = String(selectedAuthorIdentity?.value || "");
//   if (!sel) return "";
//   if (sel.endsWith(".dys")) {
//     await nameApi.resolve(sel);
//     const rec = (
//       nameRepo.all() as Array<{ input?: string; address?: string }>
//     ).find((r) => r.input === sel);
//     return String(rec?.address || "");
//   }
//   return sel;
// }

import { useNuanceApi } from "@/api/nuance-api";
import { useWallet } from "@/composables/useWallet";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";

const { claimReplyRewards } = useNuanceApi();
const { selectedAuthorIdentity } = useWallet() as any;
const nameRepo = useRepo(NameResolution);
const nameApi = useAxiosRepo(NameResolution).api();

async function resolveSelectedToAddress(): Promise<string> {
  const sel: string = String(selectedAuthorIdentity?.value || "");
  if (!sel) return "";
  if (sel.endsWith(".dys")) {
    await nameApi.resolve(sel);
    const rec = (
      nameRepo.all() as Array<{ input?: string; address?: string }>
    ).find((r) => r.input === sel);
    return String(rec?.address || "");
  }
  return sel;
}

async function handleClaimReply(id: number) {
  const idx = getReplyHotIndex(id);
  if (idx < 0 || idx >= 10) return;
  const exec = await resolveSelectedToAddress();
  if (!exec) return;
  const res = await claimReplyRewards({
    postId: postId.value,
    hotIndex: idx,
    executorAddress: exec,
  });
  if (res?.success) await refreshOneReply(id);
}

onMounted(() => {
  const io = new (window as any).IntersectionObserver(
    (entries: any[]) => {
      if (entries.some((e: any) => e.isIntersecting))
        if (
          !isLoadingReplies.value &&
          (replyItems.value.length === 0 || nextKeyReplies.value)
        )
          void loadMoreReplies();
    },
    { rootMargin: "200px" }
  );
  if (repliesSentinel.value) io.observe(repliesSentinel.value);
  if (!isLoadingReplies.value && replyItems.value.length === 0)
    void loadMoreReplies();
});
</script>
