<template>
  <div class="max-w-3xl mx-auto">
    <header class="mb-3 text-center space-y-1">
      <h1 class="text-6xl font-semibold capitalize">{{ tag }}</h1>
      <div class="space-x-2 text-sm">
        <router-link
          class="underline"
          :class="{ 'font-bold': sortBy === 'hot' }"
          :to="`/topics/${tag}/hot`"
        >
          Hot
        </router-link>
        <span>|</span>
        <router-link
          class="underline"
          :class="{ 'font-bold': sortBy === 'best' }"
          :to="`/topics/${tag}/best`"
        >
          Best
        </router-link>
        <span>|</span>
        <router-link
          class="underline"
          :class="{ 'font-bold': isStats }"
          :to="`/topics/${tag}/stats`"
        >
          Stats
        </router-link>
      </div>
      <div class="text-sm opacity-80">
        <span>Rewards available:</span>
        <strong>{{ availableDys }} DYS</strong>
        <span class="ml-2">Claimed:</span>
        <strong>{{ claimedDys }} DYS</strong>
      </div>
    </header>

    <div class="space-y-6">
      <div v-for="id in items" :key="id">
        <LazyMount>
          <NuancePost :post-id="id" :depth="1" class="border p-4 mt-1" />
        </LazyMount>
        <VoteBar
          mode="tag"
          :post-id="id"
          :tag="tag"
          :up="getUp(id)"
          :down="getDown(id)"
          claim-mode="tag"
          :author="getAuthor(id)"
          :earliest-claim-time="getEarliest(id)"
          :hot-index="getHotIndex(id)"
          :available-udys="availableUdysUdys"
          @vue:mounted="
            () =>
              console.debug('[VoteBar][mount][tag view]', {
                postId: id,
                tag,
              })
          "
          @rated="refreshOne(id)"
          @claim="() => handleClaim(id)"
        />
      </div>
      <div ref="sentinel" class="h-8"></div>
      <div class="text-sm opacity-70" v-if="isLoading">Loading…</div>
      <div class="text-sm opacity-70" v-else-if="!nextKey && items.length">
        Fin.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useRatingsStore } from "@/stores/nuance/ratings.store";
import { usePostsStore } from "@/stores/nuance/posts.store";
import { useRewardsStore } from "@/stores/nuance/rewards.store";
import { useNuanceApi } from "@/api/nuance-api";
import { useWallet } from "@/composables/useWallet";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";
import NuancePost from "@/components/nuance/NuancePost.vue";
import VoteBar from "@/components/nuance/VoteBar.vue";
import LazyMount from "@/components/nuance/LazyMount.vue";

const route = useRoute();
const { nuanceOwner } = useNuanceEnv();
const ratingsStore = useRatingsStore();
const postsStore = usePostsStore();
const rewardsStore = useRewardsStore();
const { claimTagRewards } = useNuanceApi();
const { selectedAuthorIdentity } = useWallet() as any;
const nameRepo = useRepo(NameResolution);
const nameApi = useAxiosRepo(NameResolution).api();

const tag = computed(() => String(route.params.tag || ""));
const sortBy = computed<"hot" | "best">(() =>
  String(route.name) === "NuanceTopicBest" ? "best" : "hot"
);
const isStats = computed(() => String(route.name) === "NuanceTopicStats");

const items = ref<number[]>([]);
const isLoading = ref(false);
const nextKey = ref<string | undefined>(undefined);
const sentinel = ref<null | any>(null);

const rewards = computed(() => rewardsStore.getTag(tag.value));
const availableUdysUdys = computed(() =>
  Number(rewards.value?.available?.udys || 0)
);
const availableDys = computed(() =>
  Math.floor(availableUdysUdys.value / 1_000_000)
);
const claimedDys = computed(() =>
  Math.floor(Number(rewards.value?.claimed?.udys || 0) / 1_000_000)
);

// React to route changes (tag or sort)
watch(
  () => [route.name, route.params.tag],
  () => {
    items.value = [];
    nextKey.value = undefined;
    void loadMore();
  }
);

async function loadMore() {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const ns = "tags" as const;
    const tn = tag.value;
    console.debug("[TagPostsView][tag] loadMore start", {
      tn,
      sort: sortBy.value,
    });
    const res = await ratingsStore.fetchList(
      nuanceOwner,
      ns,
      tn,
      sortBy.value,
      5,
      false
    );
    // Immediately reflect this page of ids so first posts can mount/fetch lazily
    const entryNow = ratingsStore.lists.get(`${ns}:${tn}`);
    const newIds = (
      sortBy.value === "hot" ? entryNow?.hot || [] : entryNow?.best || []
    ).slice(-res.ids.length);
    items.value = [
      ...items.value,
      ...newIds.filter((id) => !items.value.includes(id)),
    ];

    // Non-blocking: fetch counts for this page and rewards snapshot (if needed)
    await Promise.all([
      ratingsStore.fetchCounts(nuanceOwner, ns, tn, res.ids),
      rewardsStore.getTag(tn)
        ? Promise.resolve()
        : rewardsStore.fetchTag(nuanceOwner, tn),
    ]);

    // Defer hot top-10 prefetch after initial paint
    if (sortBy.value === "hot") {
      const ensureHot = async () => {
        const hotLen = ratingsStore.lists.get(`${ns}:${tn}`)?.hot?.length || 0;
        if (hotLen < 10)
          await ratingsStore.fetchList(nuanceOwner, ns, tn, "hot", 10, false);
      };
      void Promise.resolve().then(ensureHot);
    }

    const page = ratingsStore.pagination.get(`${ns}:${tn}`);
    nextKey.value =
      sortBy.value === "hot" ? page?.hot?.nextKey : page?.best?.nextKey;
    console.debug("[TagPostsView][tag] loadMore done", {
      count: items.value.length,
      nextKey: nextKey.value,
      hotLen: ratingsStore.lists.get(`${ns}:${tn}`)?.hot?.length || 0,
    });
  } finally {
    isLoading.value = false;
  }
}

function refreshOne(id: number) {
  void ratingsStore.fetchCounts(nuanceOwner, "tags", tag.value, [id]);
}

function getHotIndex(postId: number): number {
  return ratingsStore.getHotIndex("tags", tag.value, postId);
}

function getEarliest(postId: number): number {
  return Number(
    ratingsStore.getCounts("tags", tag.value, postId)?.earliestClaimTime || 0
  );
}

function getUp(postId: number): number {
  return Number(ratingsStore.getCounts("tags", tag.value, postId)?.up || 0);
}

function getDown(postId: number): number {
  return Number(ratingsStore.getCounts("tags", tag.value, postId)?.down || 0);
}

// removed per-card getters; counts are loaded by page

function getAuthor(postId: number): string {
  return String(postsStore.get(postId)?.author || "");
}

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

async function handleClaim(postId: number) {
  const idx = getHotIndex(postId);
  if (idx < 0 || idx >= 10) return;
  const exec = await resolveSelectedToAddress();
  if (!exec) return;
  const res = await claimTagRewards({
    tag: tag.value,
    hotIndex: idx,
    executorAddress: exec,
  });
  if (res?.success) {
    await rewardsStore.fetchTag(nuanceOwner, tag.value);
    await ratingsStore.fetchCounts(nuanceOwner, "tags", tag.value, [postId]);
  }
}

onMounted(() => {
  void loadMore();
  const io = new (window as any).IntersectionObserver(
    (entries: any[]) => {
      if (entries.some((e: any) => e.isIntersecting))
        if (!isLoading.value && nextKey.value) void loadMore();
    },
    { rootMargin: "400px" }
  );
  if (sentinel.value) io.observe(sentinel.value);
});
</script>
