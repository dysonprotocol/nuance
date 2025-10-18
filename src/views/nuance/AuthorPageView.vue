<template>
  <section class="container mx-auto max-w-3xl px-4 py-6">
    <div v-if="loading" class="opacity-70">Loading…</div>
    <div v-else-if="postId">
      <NuancePost :post-id="postId" :depth="0" />
    </div>
    <div v-else class="opacity-70">Page not found.</div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useNuanceContext } from "@/composables/useNuanceContext";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import Storage from "@/orm/models/storage/Storage";
import NuancePost from "@/components/nuance/NuancePost.vue";

const route = useRoute();
const { authorName } = useNuanceContext();
const { nuanceOwner } = useNuanceEnv();

const postId = ref<number | null>(null);
const loading = ref(false);

async function resolvePage() {
  const slug = String(route.params.slug || "").trim();
  const author = String(authorName.value || "").trim();
  if (!slug || !author) {
    postId.value = null;
    return;
  }
  loading.value = true;
  try {
    const index = `author_page/${author}/${slug}`;
    await useAxiosRepo(Storage).api().storageGet({ owner: nuanceOwner, index });
    const rec = useRepo(Storage).find([nuanceOwner, index, ""]) as any;
    const data = rec?.data ? JSON.parse(String(rec.data)) : null;
    const idNum = Number(data?.post_id);
    postId.value = Number.isFinite(idNum) && idNum > 0 ? idNum : null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void resolvePage();
});
watch(
  () => route.params.slug,
  () => {
    void resolvePage();
  }
);
</script>
