<template>
  <div v-if="!isReady" class="p-4 text-center text-sm opacity-70">Loading…</div>
  <template v-else>
    <Topbar />
    <router-view />

    <Toaster />
    <GlobalTransactionDialog />
  </template>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import Topbar from "./components/Topbar.vue";
import { useWallet } from "./composables/useWallet";
import GlobalTransactionDialog from "@/components/shared/GlobalTransactionDialog.vue";
import { Toaster } from "@/components/ui/sonner";
import { useTxToasts } from "@/composables/useTxToasts";

const { init, cleanup } = useWallet();

const isReady = ref(false);

onMounted(async () => {
  init();
  // Activate txHistory → toast bridge once at app root
  useTxToasts();
  isReady.value = true;
});

onBeforeUnmount(() => {
  cleanup();
});
</script>
