<template>
  <div class="mt-6 space-y-6 max-w-3xl mx-auto">
    <h2 class="text-4xl font-semibold capitalize">Featured Topics</h2>
    <div class="flex flex-wrap items-center gap-2">
      <ul>
        <li v-for="t in featuredList" :key="t.tag">
          <router-link :to="`/topics/${t.tag}`">
            {{ t.tag }} ({{ Math.floor(t.amountUdys / 1_000_000) }} DYS)
          </router-link>
        </li>
      </ul>

      <span v-if="!featuredList.length && !isLoadingFeatured" class="opacity-70"
        >No featured topics</span
      >
      <span v-if="isLoadingFeatured" class="opacity-70">Loading…</span>
    </div>
    <h2 class="text-4xl font-semibold capitalize">All Topics</h2>
    <div class="flex flex-wrap items-center gap-2">
      <ul>
        <li v-for="t in allList" :key="t">
          <router-link :to="`/topics/${t}`">
            {{ t }}
          </router-link>
        </li>
      </ul>
      <span v-if="!allList.length && !isLoadingAll" class="opacity-70"
        >No topics found</span
      >
      <span v-if="isLoadingAll" class="opacity-70">Loading…</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useTagsStore } from "@/stores/nuance/tags.store";
import { useRewardsStore } from "@/stores/nuance/rewards.store";

defineOptions({ name: "NuanceTopicsPage" });

const { nuanceOwner } = useNuanceEnv();
const tagsStore = useTagsStore();
const rewardsStore = useRewardsStore();

const featuredList = computed(() => rewardsStore.featured.items);
const isLoadingFeatured = ref(false);
const isLoadingAll = ref(false);
const allList = computed(() => tagsStore.allTopics);

async function loadFeatured() {
  if (isLoadingFeatured.value) return;
  isLoadingFeatured.value = true;
  try {
    await rewardsStore.fetchFeatured(nuanceOwner, { limit: 50 });
  } finally {
    isLoadingFeatured.value = false;
  }
}

async function loadAll() {
  if (isLoadingAll.value) return;
  isLoadingAll.value = true;
  try {
    await tagsStore.fetchAll(nuanceOwner, { limit: 200 });
  } finally {
    isLoadingAll.value = false;
  }
}

onMounted(async () => {
  if (!featuredList.value.length) await loadFeatured();
  if (!allList.value.length) await loadAll();
});
</script>
