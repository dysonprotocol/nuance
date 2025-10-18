<template>
  <section class="container mx-auto max-w-3xl px-4 py-6">
    <header class="mb-6">
      <h1 class="text-6xl font-semibold uppercase">{{ authorName }}</h1>
      <div
        v-if="profile"
        class="text-muted-foreground mt-2"
        v-html="profileHtml"
      ></div>
    </header>

    <nav v-if="pages.length" class="mt-6">
      <h2 class="text-sm uppercase tracking-wide text-muted-foreground mb-2">
        Pages
      </h2>
      <ul class="flex flex-wrap gap-3">
        <li v-for="p in pages" :key="p.path">
          <RouterLink
            class="text-primary hover:underline"
            :to="`/authors/${authorName}/${p.path}`"
          >
            {{ p.title || p.path }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <PostList :key="authorName" :author="authorName" />
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useNuanceContext } from "@/composables/useNuanceContext";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import Storage from "@/orm/models/storage/Storage";
import PostList from "./PostList.vue";
import { renderMarkdownToSafeHtml } from "@/composables/useSafeMarkdown.js";

const { authorName: authorNameRef } = useNuanceContext();
const authorName = computed(() => String(authorNameRef.value || ""));
const { nuanceOwner } = useNuanceEnv();

const profile = ref<{ content?: string } | null>(null);
const profileHtml = computed(() =>
  renderMarkdownToSafeHtml(profile.value?.content || "")
);

interface LinkedPage {
  path: string;
  title: string;
}

const pages = ref<LinkedPage[]>([]);

async function loadProfile() {
  const name = authorName.value;
  if (!name) return;
  const index = `authors/${name}/profile`;
  await useAxiosRepo(Storage).api().storageGet({ owner: nuanceOwner, index });
  const repo = useRepo(Storage);
  // The API stores the bech32 owner from the response, which may differ from nuanceOwner (a name).
  // Query by index to retrieve the inserted record regardless of owner format.
  const rec = repo
    .query()
    .where("index", (v: string) => v === index)
    .where("extract", (v: string) => v === "")
    .first() as any;
  try {
    profile.value = rec?.data ? JSON.parse(String(rec.data)) : { content: "" };
  } catch (error) {
    console.error("Failed to parse author profile JSON", {
      owner: nuanceOwner,
      index,
      error,
    });
    profile.value = { content: "" };
  }
}

onMounted(() => {
  void loadProfile();
  void loadPages();
});

async function loadPages() {
  const name = authorName.value.trim();
  if (!name) return;
  const prefix = `author_page/${name}/`;
  await useAxiosRepo(Storage).api().storageList({
    owner: nuanceOwner,
    index_prefix: prefix,
    limit: "100",
  });
  const repo = useRepo(Storage);
  const records = repo
    .query()
    .where("index", (v: string) => String(v || "").startsWith(prefix))
    .where("extract", (v: string) => v === "")
    .get() as Array<{ index?: string; data?: string }>;

  const items: LinkedPage[] = [];
  for (const r of records) {
    const idx = String(r.index || "");
    const slug = idx.slice(prefix.length);
    try {
      const j = r?.data ? JSON.parse(String(r.data)) : {};
      items.push({
        path: String(j?.path || slug),
        title: String(j?.title || slug),
      });
    } catch (error) {
      console.error("Failed to parse author page JSON", { index: idx, error });
      items.push({ path: slug, title: slug });
    }
  }
  pages.value = items;
}
</script>
