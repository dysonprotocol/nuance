<template>
  <div class="max-w-3xl mx-auto p-4 space-y-6">
    <h1 class="text-2xl font-semibold">Wallet Management</h1>

    <section aria-labelledby="ext-wallets" class="space-y-2">
      <h2 id="ext-wallets" class="text-lg font-medium">Browser Extension</h2>
      <KeplrCard />
    </section>

    <section aria-labelledby="local-wallets" class="space-y-2">
      <h2 id="local-wallets" class="text-lg font-medium">
        Imported CosmJS Wallets
      </h2>
      <CosmjsWallets />
    </section>
  </div>
</template>

<script setup lang="ts">
import KeplrCard from "@/components/wallet/KeplrCard.vue";
import CosmjsWallets from "@/components/wallet/CosmjsWallets.vue";

defineOptions({ name: "WalletsView" });
</script>
