<template>
  <header>
    <a :href="postHref">Post #{{ post.postId }}</a>
    posted
    <time :datetime="datetimeIso">{{ relativeTime }} ago</time>
    by
    <a class="author" :href="authorHref">{{ post.author }}</a>
    has earned {{ claimedDys || 0 }} DYS2
    <PostTags
      :post-id="post.postId"
      :author="post.author"
      :active-tag="activeTag"
    />
  </header>
  <hr class="border-primary/30 my-4" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import PostTags from "@/components/nuance/PostTags.vue";
import useNuanceContext from "@/composables/useNuanceContext";

const props = defineProps<{
  post: {
    postId: number;
    author: string;
    createdTime: string | number;
    claimedDys: number;
  };
  activeTag?: string;
}>();

import { formatRelativeTime } from "@/utils/time";

const relativeTime = computed(() => formatRelativeTime(props.post.createdTime));
const datetimeIso = computed(() => {
  const d = new Date(props.post.createdTime);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString();
});

const claimedDys = computed(() => Number(props.post.claimedDys || 0));

const { isWhitelabel, nuanceHost } = useNuanceContext();

const postHref = computed(() => {
  const p = `/${props.post.postId}`;
  const host = nuanceHost.value;
  return isWhitelabel.value && host ? `//${host}${p}` : p;
});

const authorHref = computed(() => {
  const p = `/authors/${props.post.author}`;
  const host = nuanceHost.value;
  return isWhitelabel.value && host ? `//${host}${p}` : p;
});
</script>
