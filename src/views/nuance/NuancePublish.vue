<template>
  <div class="p-4 max-w-3xl mx-auto space-y-4">
    <h1 class="text-xl font-semibold">Publish Post</h1>
    <div class="space-y-2">
      <label class="text-sm">Content</label>
      <Textarea v-model="content" rows="8" placeholder="Write your post..." />
    </div>

    <div class="flex items-center gap-2">
      <Button type="button" :disabled="!canSubmit" @click="submit"
        >Publish</Button
      >
    </div>

    <div v-if="error" class="text-sm text-red-600">{{ error }}</div>
    <div v-if="txOk" class="text-sm text-green-600">Published.</div>

    <!-- Live Preview -->
    <section class="space-y-2" aria-live="polite">
      <h2 class="text-lg font-semibold">Preview</h2>
      <article class="nuance-post border border-primary/30 p-4 my-2">
        <header>
          <span>Post #∞</span>
          <span class="mx-1">by</span>
          <span class="author">{{ authorDisplay }}</span>
          <span class="mx-1">on</span>
          <time :datetime="new Date().toISOString()">{{ nowDisplay }}</time>
          <span class="mx-1">has earned 0 DYS</span>
        </header>
        <hr class="border-primary/30 my-4" />
        <div class="markdown nuance">
          <PostContent :content="content" :depth="1" />
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWallet } from "@/composables/useWallet";
import { useNuanceApi } from "@/api/nuance-api";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";
import PostContent from "@/components/nuance/PostContent.vue";

const content = ref("");
const { selectedAuthorIdentity } = useWallet() as any;
const nameRepo = useRepo(NameResolution);
const nameApi = useAxiosRepo(NameResolution).api();
const error = ref("");
const txOk = ref(false);

const { publishPost } = useNuanceApi();

const canSubmit = computed(
  () =>
    String(selectedAuthorIdentity.value || "") &&
    content.value.trim().length > 0
);

const authorDisplay = computed(() =>
  String(selectedAuthorIdentity.value || "Not connected")
);
const nowDisplay = computed(() => new Date().toLocaleString());

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

async function submit() {
  error.value = "";
  txOk.value = false;
  const executor = await resolveSelectedToAddress();
  if (!executor) {
    error.value = "Select an identity in the top bar to publish.";
    return;
  }
  const res = await publishPost({
    content: content.value,
    author: String(selectedAuthorIdentity.value || ""),
    executorAddress: executor,
  });
  if (!res?.success) {
    error.value = getReadableError(res) || "Failed to publish";
    return;
  }
  txOk.value = true;
  content.value = "";
}

function getReadableError(res: unknown): string {
  try {
    const r: any = res as any;
    const rawLog = r?.rawSendMsgsResponse?.rawLog;
    if (typeof rawLog === "string" && rawLog.trim()) {
      try {
        const j = JSON.parse(rawLog);
        if (j && typeof j === "object") {
          if (typeof j.message === "string" && j.message) return j.message;
          return JSON.stringify(j);
        }
      } catch {
        return String(rawLog);
      }
    }
    if (typeof r?.error?.message === "string" && r.error.message)
      return r.error.message;
    if (typeof r?.message === "string" && r.message) return r.message;
    return typeof res === "string" ? (res as string) : JSON.stringify(res);
  } catch {
    return "";
  }
}
</script>
