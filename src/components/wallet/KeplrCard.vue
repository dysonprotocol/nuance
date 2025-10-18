<template>
  <Card class="my-2">
    <CardHeader>
      <CardTitle class="flex items-center justify-between">
        <span>{{ titleText }}</span>
        <span
          v-if="address"
          class="text-xs font-mono text-muted-foreground break-all"
          >{{ address }}</span
        >
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="isBusy || isKeplrConnected || !isKeplrAvailable"
            @click="connectKeplr"
          >
            <Loader2 v-if="isBusy" class="mr-2 h-4 w-4 animate-spin" />
            Connect
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="isBusy || !isKeplrConnected"
            @click="disconnect"
          >
            Disconnect
          </Button>
        </div>
        <p v-if="!isKeplrAvailable" class="text-destructive text-sm">
          keplr is not available, please install and enable it
        </p>
        <p v-if="errorMessage" class="text-destructive text-sm">
          {{ errorMessage }}
        </p>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useWallet } from "@/composables/useWallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-vue-next";

const { unlockedWallets, connectExtension, lockWallet } = useWallet();

const keplrWallet = computed(
  () => unlockedWallets.value.find((w) => w.type === "keplr") || null
);
const address = computed(() => keplrWallet.value?.address || "");
const isKeplrConnected = computed(
  () => Boolean(keplrWallet.value) && isKeplrAvailable.value
);

const titleText = computed(() => keplrWallet.value?.name || "Keplr Wallet");

const isBusy = ref(false);
const errorMessage = ref("");
const isKeplrAvailable = ref(false);

onMounted(() => {
  isKeplrAvailable.value = typeof window !== "undefined" && !!window.keplr;
});

const connectKeplr = async () => {
  errorMessage.value = "";
  isBusy.value = true;
  try {
    await connectExtension("keplr");
  } catch (e) {
    errorMessage.value = e?.message || String(e);
  } finally {
    isBusy.value = false;
  }
};

const disconnect = () => {
  errorMessage.value = "";
  const w = keplrWallet.value;
  if (!w) return;
  lockWallet(w.name);
};
</script>
