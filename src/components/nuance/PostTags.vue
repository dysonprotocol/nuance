<template>
  <section class="mt-1 text-xs w-full">
    <div class="flex flex-wrap items-center gap-2">
      <template v-for="t in sorted" :key="t.tag">
        <a
          :href="`/topics/${t.tag}`"
          :class="{
            'font-bold': activeTag === t.tag,
          }"
          @click.prevent="open(t.tag)"
          >{{ t.tag }}
        </a>
      </template>
      <span v-if="!sorted.length && !isLoading" class="opacity-70"
        >No tags</span
      >
      <span v-if="isLoading" class="opacity-70">Loading…</span>
      <template v-if="isAuthor">
        <template v-if="showAdd">
          <input
            v-model="newTag"
            @keydown.enter.prevent="add"
            placeholder="add tag"
            maxlength="64"
            class="h-7 px-2 border rounded outline-none"
          />
          <Button type="button" size="sm" :disabled="!isValidTag" @click="add">
            Add
          </Button>
          <a href="#" class="ml-1" title="Close" @click.prevent="closeAdd">x</a>
        </template>
        <template v-else>
          <a href="#" class="" @click.prevent="openAdd">+</a>
        </template>
      </template>
    </div>

    <div v-if="selected" class="my-4 p-2">
      <div class="flex items-center gap-2 justify-between">
        <h2 class="text-lg font-bold">
          {{ selected }}
          <a href="#" class="ml-1" title="Close" @click.prevent="open(null)">
            <span class="text-xl">×</span>
          </a>
        </h2>

        <a :href="`/topics/${selected}`"> all {{ selected }} posts </a>
      </div>
      <VoteBar
        mode="tag"
        :post-id="postId"
        :tag="selected!"
        :up="selectedItem?.up"
        :down="selectedItem?.down"
        @rated="augmentCounts([selected!])"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";
import { useNuanceApi } from "@/api/nuance-api";
import { useExecutor } from "@/composables/useExecutor";
import { useWallet } from "@/composables/useWallet";
import { Button } from "@/components/ui/button";
import VoteBar from "@/components/nuance/VoteBar.vue";

const props = defineProps<{
  postId: number;
  author: string;
  activeTag?: string;
}>();

const { nuanceOwner } = useNuanceEnv();
const storageRepo = useRepo(Storage);
const storageApi = useAxiosRepo(Storage).api();
const nameRepo = useRepo(NameResolution);
const nameApi = useAxiosRepo(NameResolution).api();
const { rateTag } = useNuanceApi();
const { executorAddress } = useExecutor();
const { unlockedWallets } = useWallet();

type TagItem = { tag: string; up?: number; down?: number; bestRating?: number };
const items = ref<TagItem[]>([]);
const isLoading = ref(false);
const nextKey = ref<string | undefined>(undefined);
const selected = ref<string | null>(null);
const selectedItem = computed(() =>
  items.value.find((x) => x.tag === selected.value)
);

function pad15(n: number): string {
  return String(n).padStart(15, "0");
}

const sorted = computed(() =>
  [...items.value].sort(
    (a, b) => Number(b.bestRating || 0) - Number(a.bestRating || 0)
  )
);

const newTag = ref("");
const showAdd = ref(false);
const TAG_RE = /^[a-zA-Z0-9-]{1,64}$/;
const isValidTag = computed(() => TAG_RE.test(newTag.value.trim()));

const resolvedAuthor = ref("");
const isAuthor = computed(() => {
  const a = props.author || "";
  const addr = a.endsWith(".dys") ? resolvedAuthor.value : a;
  if (!addr) return false;
  if (executorAddress.value) return executorAddress.value === addr;
  return unlockedWallets.value.some((w: any) => w.address === addr);
});

async function resolveAuthorIfNeeded() {
  const a = props.author || "";
  if (!a.endsWith(".dys")) {
    resolvedAuthor.value = a;
    return;
  }
  await nameApi.resolve(a);
  const r = (
    nameRepo.all() as Array<{ input?: string; address?: string }>
  ).find((x) => x.input === a);
  resolvedAuthor.value = String(r?.address || "");
}

async function augmentCounts(tags: string[]) {
  for (const tag of tags) {
    const idx = `rate_tags/tags/${tag}/${pad15(props.postId)}`;
    await storageApi.storageGet({ owner: nuanceOwner, index: idx });
    const row = (
      storageRepo.all() as Array<{
        owner?: string;
        index?: string;
        data?: string;
      }>
    ).find((e) => e.owner === nuanceOwner && e.index === idx);
    if (!row) continue;
    try {
      const j = JSON.parse(String(row.data || "")) as {
        up?: number;
        down?: number;
        best_rating?: number;
      };
      const it = items.value.find((x) => x.tag === tag);
      if (it) {
        it.up = Number(j.up || 0);
        it.down = Number(j.down || 0);
        it.bestRating = Number(j.best_rating || 0);
      }
    } catch {
      // ignore parse errors
    }
  }
}

async function load() {
  if (isLoading.value) return;
  isLoading.value = true;
  try {
    const prefix = `reverse_rates/tags/${pad15(props.postId)}/best/`;
    const res = await storageApi.storageList({
      owner: nuanceOwner,
      index_prefix: prefix,
      next_key: nextKey.value,
      limit: "20",
    });
    const list = (
      storageRepo.all() as Array<{
        owner?: string;
        index?: string;
        data?: string;
      }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const tags = slice
      .map((e) => {
        try {
          return String(JSON.parse(String(e.data || "")).tag_name || "");
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    items.value.push(...tags.map((t) => ({ tag: t })));
    // Lazy-load counts for visible chips in small chunks
    const chunk = (arr: string[], size = 5) =>
      arr.reduce((acc: string[][], t, i) => {
        if (i % size === 0) acc.push([]);
        acc[acc.length - 1].push(t);
        return acc;
      }, []);
    for (const group of chunk(tags, 5)) {
      // allow rendering between chunks
      await augmentCounts(group);
    }
    nextKey.value = res.next_key;
  } finally {
    isLoading.value = false;
  }
}

function pickExecutor(): string {
  if (executorAddress.value) return executorAddress.value;
  const a = props.author;
  const isName = a.endsWith(".dys");
  const wallets = unlockedWallets.value as Array<{ address: string }>;
  if (!isName) return wallets.find((w) => w.address === a)?.address || "";
  const addr = resolvedAuthor.value;
  return wallets.find((w) => w.address === addr)?.address || "";
}

function open(tag: string | null) {
  if (selected.value === tag) {
    selected.value = null;
    return;
  }
  selected.value = tag;
}

// Voting handled by VoteBar; keep add() for author tag creation

onMounted(async () => {
  await resolveAuthorIfNeeded();
  void load();
});

async function add() {
  const t = newTag.value.trim().toLowerCase();
  if (!TAG_RE.test(t)) {
    (window as any).alert("Invalid tag (alnum + hyphen, ≤64)");
    throw new Error("invalid tag");
  }
  const exec = pickExecutor();
  if (!exec) {
    const m = "Select a wallet to add tag.";
    (window as any).alert(m);
    throw new Error(m);
  }
  const res = await rateTag({
    tag: t,
    postId: props.postId,
    rate: "up",
    amountUdys: 1_000_000,
    executorAddress: exec,
  });
  if (!res?.success) {
    const msg = (res as any)?.raw?.message || "Add tag failed";
    console.error("add tag failed", res);
    (window as any).alert(msg);
    throw new Error(msg);
  }
  newTag.value = "";
  showAdd.value = false;
  items.value = [];
  nextKey.value = undefined;
  await load();
}

function openAdd() {
  showAdd.value = true;
}
function closeAdd() {
  showAdd.value = false;
}
</script>
