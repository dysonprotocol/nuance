<template>
  <article
    v-bind="$attrs"
    class="nuance-post border border-primary/30 p-4 mt-4 hover:border-primary/50"
  >
    <PostHeader
      :post="{
        postId: post.postId,
        author: post.author,
        createdTime: post.createdTime,
        claimedDys: Math.floor(Number(post.claimedUdys || 0) / 1_000_000),
      }"
      :active-tag="activeTag"
    />

    <div class="markdown nuance">
      <PostContent
        :content="post.content"
        :depth="depth"
        :fragment="fragment"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import PostContent from "@/components/nuance/PostContent.vue";
import PostHeader from "@/components/nuance/PostHeader.vue";

defineProps<{
  post: {
    postId: number;
    author: string;
    content: string;
    createdTime: string | number;
    claimedUdys?: number;
  };
  depth: number;
  fragment?: string;
  activeTag?: string;
}>();
</script>
