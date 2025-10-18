<template>
  <div class="flex items-center gap-3 text-sm">
    <div class="flex items-center gap-1">
      <span class="opacity-70">Available:</span>
      <span class="font-mono">{{ availableDys }} DYS</span>
    </div>
    <div class="flex items-center gap-1">
      <span class="opacity-70">Claimed:</span>
      <span class="font-mono">{{ claimedDys }} DYS</span>
    </div>
    <Button size="sm" :disabled="!canClaimSafe" @click="$emit('claim')"
      >Claim</Button
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  availableUdys: number;
  claimedUdys: number;
  canClaim?: boolean;
}>();

const availableDys = computed(() =>
  Math.floor((props.availableUdys || 0) / 1_000_000)
);
const claimedDys = computed(() =>
  Math.floor((props.claimedUdys || 0) / 1_000_000)
);
const canClaimSafe = computed(() => props.canClaim !== false);
</script>
