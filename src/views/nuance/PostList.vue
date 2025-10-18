<template>
  <div class="max-w-3xl mx-auto">
    <div class="space-y-6">
      <template v-if="variant === 'active'">
        <div v-for="id in activeIds" :key="id" class="space-y-1">
          <LazyMount>
            <NuancePost :post-id="id" :depth="1" />
          </LazyMount>
          <div class="text-xs opacity-80 pl-1">
            Available for replies: {{ formatDys(getActiveUdys(id)) }} DYS
          </div>
        </div>
      </template>
      <template v-else>
        <div v-for="p in posts" :key="p.postId" class="space-y-1">
          <LazyMount>
            <NuancePost :post-id="p.postId" :depth="1" />
          </LazyMount>
        </div>
      </template>
      <div ref="sentinel" class="h-8"></div>
      <div class="text-sm opacity-70" v-if="isLoading">Loading…</div>
      <div class="text-sm opacity-70" v-else-if="!nextKey && posts.length">
        Fin.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { usePostsStore, type PostDto } from "@/stores/nuance/posts.store";
import { useRewardsStore } from "@/stores/nuance/rewards.store";
import NuancePost from "@/components/nuance/NuancePost.vue";
import LazyMount from "@/components/nuance/LazyMount.vue";

const props = defineProps<{ author?: string; variant?: "recent" | "active" }>();
const { nuanceOwner } = useNuanceEnv();
const postsStore = usePostsStore();
const rewardsStore = useRewardsStore();

const variant = computed<"recent" | "active">(() =>
  props.variant === "active" ? "active" : "recent"
);

const author = computed(() => String(props.author ?? ""));

const posts = ref<PostDto[]>([]);
const activeIds = ref<number[]>([]);
const nextKey = ref<string | undefined>(undefined);
const isLoading = ref(false);
const sentinel = ref<null | any>(null);

async function loadMore() {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const owner = nuanceOwner;
    if (variant.value === "active") {
      const res = await rewardsStore.fetchActive(owner, { limit: 10 });
      for (const it of res.items)
        if (!activeIds.value.includes(it.postId))
          activeIds.value.push(it.postId);
      nextKey.value = rewardsStore.active.nextKey;
    } else if (author.value) {
      await postsStore.fetchByAuthor(owner, author.value, { limit: 10 });
      posts.value = postsStore.listByAuthor(author.value);
      nextKey.value = postsStore.pagination.byAuthor.get(author.value)?.nextKey;
    } else {
      await postsStore.fetchRecent(owner, { limit: 10 });
      posts.value = postsStore.listRecent();
      nextKey.value = postsStore.pagination.recent.nextKey;
    }
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  // Always trigger the first load so VoteBar can mount and log
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

watch([author, variant], () => {
  posts.value = [];
  activeIds.value = [];
  nextKey.value = undefined;
  void loadMore();
});

function getActiveUdys(postId: number): number {
  const it = rewardsStore.active.items.find((x) => x.postId === postId);
  return it?.amountUdys || 0;
}

function formatDys(udys: number): string {
  const v = Number(udys) / 1_000_000;
  if (!isFinite(v)) return "0";
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
</script>
