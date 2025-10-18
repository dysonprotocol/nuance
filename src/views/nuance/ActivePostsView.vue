<template>
  <div class="max-w-3xl mx-auto">
    <header class="mb-3 text-center space-y-1">
      <h1 class="text-6xl font-semibold capitalize">Active Posts</h1>
    </header>
  </div>
  <PostList variant="active" />
</template>

<script setup lang="ts">
import PostList from "./PostList.vue";
</script>
