<template>
  <article
    v-bind="$attrs"
    class="nuance-post border border-primary/30 p-4 hover:border-primary/50"
  >
    <div v-if="loading" class="opacity-70">Loading…</div>
    <div v-else-if="post">
      <PostHeader
        :post="{
          postId: post.postId,
          author: post.author,
          createdTime: post.createdTime,
          claimedDys: Math.floor(Number(post.claimedUdys || 0) / 1_000_000),
        }"
      />

      <div class="markdown nuance">
        <PostContent
          :content="post.content"
          :depth="depth"
          :fragment="fragment"
        />
      </div>
    </div>
    <div v-else class="opacity-70">Post not found.</div>
  </article>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { usePosts, type PostDto } from "@/composables/usePosts";
import PostContent from "@/components/nuance/PostContent.vue";
import PostHeader from "@/components/nuance/PostHeader.vue";

const props = defineProps<{
  postId: number;
  depth: number;
  fragment?: string;
}>();

const { nuanceOwner } = useNuanceEnv();
const { fetchById } = usePosts();

const post = ref<PostDto | null>(null);
const loading = ref(false);

async function load() {
  if (loading.value) return;
  loading.value = true;
  try {
    post.value = await fetchById(nuanceOwner, props.postId);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
