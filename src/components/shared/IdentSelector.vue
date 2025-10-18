<template>
  <div class="relative min-w-0 overflow-hidden">
    <Dialog v-model:open="isOpen">
      <DialogTrigger asChild>
        <Button
          type="button"
          :class="[
            'min-w-0',
            'overflow-hidden',
            'flex',
            'items-center',
            'justify-between',
            'gap-2',
            buttonClass,
          ]"
          data-testid="ident-selector-open"
        >
          <span class="ml-1 flex-1 min-w-0 truncate">{{ selectedLabel }}</span>
          <ChevronUpIcon v-if="isOpen" class="size-4 opacity-70" />
          <ChevronDownIcon v-else class="size-4 opacity-70" />
        </Button>
      </DialogTrigger>

      <DialogContent
        class="sm:max-w-lg w-full max-h-[85vh] overflow-y-auto"
        data-testid="ident-selector-modal"
      >
        <DialogHeader>
          <DialogTitle>Select author identity</DialogTitle>
        </DialogHeader>

        <ul class="space-y-2">
          <li v-if="groups.length === 0" class="p-4 text-sm opacity-70">
            No wallets connected. Unlock a wallet to load names.
          </li>

          <li v-for="group in groups" :key="group.wallet.address" class="">
            <button
              class="w-full text-left p-4 text-sm md border border-primary/10 hover:bg-primary/10 hover:cursor-pointer"
              :class="{ 'bg-primary/10': isSelected(group.wallet.address) }"
              role="button"
              tabindex="0"
              @click.stop="selectAddress(group.wallet.address)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium">{{ group.wallet.name }}</span>
                  <span class="opacity-70"> ({{ group.wallet.type }})</span>
                </div>
                <span
                  v-if="isSelected(group.wallet.address)"
                  class="text-primary"
                >
                  <CheckIcon class="size-5" />
                </span>
              </div>
              <div class="text-xs font-mono opacity-80 mt-1 break-all">
                {{ group.wallet.address }}
              </div>

              <!-- Nested names inside the parent clickable card -->
              <div>
                <div class="text-xs text-foreground/60 my-2">Names</div>
                <div v-if="group.names.length === 0" class="text-xs opacity-70">
                  No names pointing to this address.
                </div>
                <div v-else class="space-y-1">
                  <button
                    v-for="nm in group.names"
                    :key="nm"
                    class="w-full text-left p-2 text-sm btn btn-sm border border-primary/10 hover:bg-primary/10 hover:cursor-pointer"
                    :class="{ 'bg-primary/10': isSelected(nm) }"
                    @click.stop="selectName(nm)"
                  >
                    <div class="w-full flex items-center justify-between">
                      <span class="font-medium">{{ nm }}</span>
                      <span v-if="isSelected(nm)" class="text-primary">
                        <CheckIcon class="size-5" />
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/vue/20/solid";
import { useWallet } from "@/composables/useWallet";
import { useAxiosRepo } from "@pinia-orm/axios";
import { useRepo } from "pinia-orm";
import NamesByDestination from "@/orm/models/nameservice/NamesByDestination";
import NftItem from "@/orm/models/nft/NftItem";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const props = defineProps({
  modelValue: { type: String, default: "" },
  buttonClass: { type: String, default: "" },
});
const emit = defineEmits(["update:modelValue"]);

const { unlockedWallets, chainId } = useWallet();

const isOpen = ref(false);

const repo = useRepo(NamesByDestination);
const api = useAxiosRepo(NamesByDestination).api();
const itemRepo = useRepo(NftItem);
const itemApi = useAxiosRepo(NftItem).api();

async function fetchAllNamesFor(address: string) {
  const first = await api.fetchInit({ destination: address, limit: "100" });
  let nextKey = first?.next_key || "";
  let page = first?.page || 1;
  while (nextKey) {
    const more = await api.fetchLoadMore({
      destination: address,
      next_key: nextKey,
      page,
      limit: "100",
    });
    nextKey = more?.next_key || "";
    page = more?.page || page;
  }
}

async function fetchAllOwnedNamesFor(address: string) {
  const first = await itemApi.fetchNfts({
    class_id: "nameservice.dys",
    owner: address,
    limit: "100",
  });
  let nextKey = first?.next_key || "";
  while (nextKey) {
    const more = await itemApi.fetchNfts({
      class_id: "nameservice.dys",
      owner: address,
      next_key: nextKey,
      limit: "100",
    });
    nextKey = more?.next_key || "";
  }
}

async function refreshNames() {
  const addrs = unlockedWallets.value.map((w: any) => w.address);
  if (addrs.length === 0) return;
  await Promise.allSettled(
    addrs.flatMap((a) => [fetchAllNamesFor(a), fetchAllOwnedNamesFor(a)])
  );
}

onMounted(refreshNames);

watch(
  () => [
    unlockedWallets.value.map((w: any) => w.address).join(","),
    chainId.value,
  ],
  () => refreshNames()
);

const groups = computed(() => {
  return unlockedWallets.value.map((w: any) => {
    const byDest = (repo.where("destination", w.address).get() as any[]).map(
      (r: any) => String(r?.name || "")
    );
    const owned = (
      itemRepo
        .all()
        .filter(
          (n: any) => n.class_id === "nameservice.dys" && n.owner === w.address
        ) as any[]
    ).map((n: any) => String(n?.id || ""));
    const uniq = Array.from(new Set([...byDest, ...owned])).filter(Boolean);
    uniq.sort((a, b) => a.localeCompare(b));
    return { wallet: w, names: uniq };
  });
});

const selectedLabel = computed(() =>
  props.modelValue ? props.modelValue : "Select author"
);

function closeModal() {
  isOpen.value = false;
}

function isSelected(value: string) {
  return props.modelValue === value;
}

function selectAddress(address: string) {
  emit("update:modelValue", address);
  closeModal();
}

function selectName(name: string) {
  emit("update:modelValue", name);
  closeModal();
}
</script>
