<template>
  <AccordionItem
    :value="value"
    :data-testid="dataTestId"
    :class="
      cn('border last:border-b rounded-md my-2', borderClass(), itemClass)
    "
  >
    <AccordionTrigger
      :data-testid="triggerTestId"
      :class="cn({ 'font-bold': isActive })"
    >
      <span class="text-base">{{ title }}</span>
    </AccordionTrigger>
    <AccordionContent>
      <slot name="content-top" />

      <div v-if="address" class="mb-2 break-all">
        <AddressDisplay :address="address" :truncate="10" />
      </div>

      <slot />
    </AccordionContent>
  </AccordionItem>
</template>

<script setup lang="ts">
import AddressDisplay from "@/components/AddressDisplay.vue";
import { cn } from "@/lib/utils";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const props = defineProps<{
  value: string;
  title: string;
  isActive?: boolean;
  unlockedActive?: boolean;
  address?: string;
  itemClass?: string;
  dataTestId?: string;
  triggerTestId?: string;
}>();

function borderClass(): string {
  if (props.isActive)
    return props.unlockedActive ? "border-success" : "border-warning";
  return "border-primary/20";
}
</script>

<style scoped></style>
