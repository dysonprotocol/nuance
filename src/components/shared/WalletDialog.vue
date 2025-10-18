<template>
  <Dialog v-model:open="internalOpen">
    <DialogContent class="max-w-3xl w-full">
      <DialogHeader>
        <DialogTitle>Wallet Manager</DialogTitle>
      </DialogHeader>

      <div class="space-y-6">
        <!-- Keplr section -->
        <section class="space-y-2">
          <div v-if="hasKeplrWallet" class="border rounded-md p-4">
            <div class="flex items-center justify-between">
              <div class="font-medium">{{ keplrWallet?.name }} (Keplr)</div>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  :disabled="loading"
                  data-testid="disconnect-keplr"
                  @click="handleKeplr"
                >
                  Disconnect
                </Button>
              </div>
            </div>
            <div class="mt-2 font-mono text-xs break-all">
              {{ keplrWallet?.address }}
            </div>
          </div>
          <div v-else class="space-y-2">
            <Button
              size="sm"
              class="w-full justify-between"
              :disabled="loading"
              data-testid="connect-keplr"
              @click="handleKeplr"
            >
              <span>Keplr Wallet</span>
              <span>Connect</span>
            </Button>
            <div
              v-if="keplrError"
              class="text-destructive text-xs"
              data-testid="keplr-error"
            >
              {{ keplrError }}
            </div>
          </div>
        </section>

        <!-- Local wallets -->
        <section class="space-y-2">
          <div
            v-for="wallet in localCosmJsWallets"
            :key="wallet.name"
            class="border rounded-md"
            :data-testid="`wallet-row-${wallet.name}`"
          >
            <div class="p-3">
              <div class="flex items-center justify-between">
                <div
                  class="font-medium"
                  :data-testid="`wallet-name-${wallet.name}`"
                >
                  {{ wallet.name }}
                </div>
                <div class="flex items-center gap-2">
                  <Button
                    v-if="isWalletUnlocked(wallet)"
                    size="xs"
                    variant="outline"
                    :data-testid="`lock-wallet-${wallet.name}`"
                    @click.stop="lockWallet(wallet.name)"
                  >
                    Lock
                  </Button>
                </div>
              </div>

              <div
                class="mt-2 font-mono text-xs break-all"
                :data-testid="`wallet-address-${wallet.name}`"
              >
                {{ wallet.address }}
              </div>

              <div class="mt-3 flex items-center gap-2">
                <div
                  v-if="!isWalletUnlocked(wallet)"
                  class="flex items-center gap-2"
                >
                  <Input
                    type="password"
                    placeholder="Password"
                    class="h-8 w-40"
                    :data-testid="`unlock-password-${wallet.name}`"
                    :disabled="unlockLoading[wallet.name]"
                    @input="clearUnlockError(wallet.name)"
                    @keyup.enter="
                      (e) =>
                        !unlockLoading[wallet.name] &&
                        handleInlineUnlock(wallet, e.target.value)
                    "
                  />
                  <Button
                    size="xs"
                    :disabled="unlockLoading[wallet.name]"
                    :data-testid="`unlock-wallet-${wallet.name}`"
                    @click.stop="() => handleUnlockClick(wallet)"
                  >
                    {{ unlockLoading[wallet.name] ? "Unlocking…" : "Unlock" }}
                  </Button>
                </div>

                <div
                  v-if="unlockErrors[wallet.name]"
                  class="text-xs text-destructive"
                  :data-testid="`unlock-error-${wallet.name}`"
                >
                  {{ unlockErrors[wallet.name] }}
                </div>

                <Button
                  class="ml-auto"
                  size="xs"
                  variant="destructive"
                  :data-testid="`wallet-remove-${wallet.name}`"
                  @click.stop="handleRemoveWallet(wallet.name)"
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>

          <div
            v-if="localCosmJsWallets.length === 0"
            class="text-center text-sm text-muted-foreground py-4"
          >
            No wallets imported yet
          </div>
        </section>

        <!-- Import wallet -->
        <section class="border rounded-md p-3">
          <div class="text-sm font-medium mb-2">Import New Wallet</div>
          <form data-testid="import-wallet-form" @submit.prevent="handleImport">
            <div class="space-y-3">
              <Input
                v-model="newWalletName"
                placeholder="Wallet name"
                class="h-9"
                data-testid="wallet-name-input"
                required
              />

              <div class="space-y-2">
                <textarea
                  v-model="mnemonic"
                  placeholder="Enter recovery phrase…"
                  class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  rows="2"
                  data-testid="mnemonic-input"
                  required
                />
                <div class="flex gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    data-testid="generate-12-words"
                    :disabled="loading"
                    @click="generateSeed(12)"
                    >12W</Button
                  >
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    data-testid="generate-24-words"
                    :disabled="loading"
                    @click="generateSeed(24)"
                    >24W</Button
                  >
                </div>
              </div>

              <label class="flex items-start gap-2 text-xs">
                <input
                  v-model="seedBackedUp"
                  type="checkbox"
                  class="mt-1"
                  data-testid="security-confirmation"
                  required
                />
                <span class="text-muted-foreground"
                  >I've backed up my recovery phrase</span
                >
              </label>

              <Input
                v-model="newWalletPassword"
                type="password"
                placeholder="Password"
                class="h-9"
                data-testid="wallet-password-input"
                :disabled="!seedBackedUp"
                required
              />
            </div>

            <div
              v-if="importError"
              class="text-destructive text-xs mt-2"
              data-testid="import-error"
            >
              {{ importError }}
            </div>

            <Button
              type="submit"
              class="w-full mt-3"
              :disabled="!canImport || loading"
              data-testid="import-wallet-submit"
            >
              Import Wallet
            </Button>
          </form>
        </section>

        <!-- Bulk actions -->
        <section class="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            class="w-full"
            data-testid="disconnect-all"
            :disabled="unlockedWallets.length === 0"
            @click="handleDisconnectAll"
          >
            Disconnect All
          </Button>
          <Button
            variant="destructive"
            class="w-full"
            data-testid="remove-all"
            :disabled="localCosmJsWallets.length === 0"
            @click="handleRemoveAll"
          >
            Remove All Wallets
          </Button>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/composables/useWallet";

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(["close"]);

const internalOpen = computed({
  get: () => props.open,
  set: (v) => {
    if (!v) emit("close");
  },
});

const {
  unlockedWallets,
  localCosmJsWallets,
  connectExtension,
  importNamedCosmJsWallet,
  connectNamedCosmJsWallet,
  lockWallet,
  unlockWallet,
  removeNamedCosmJsWallet,
  generateMnemonic,
  disconnectWallet,
} = useWallet();

const loading = ref(false);
const importError = ref("");
const keplrError = ref("");

const mnemonic = ref("");
const newWalletName = ref("");
const newWalletPassword = ref("");
const seedBackedUp = ref(false);

const unlockLoading = reactive({});
const unlockErrors = reactive({});

const canImport = computed(
  () =>
    newWalletName.value.trim() &&
    newWalletPassword.value.trim() &&
    mnemonic.value.trim() &&
    seedBackedUp.value
);

const hasKeplrWallet = computed(() =>
  unlockedWallets.value.some((w) => w.type === "keplr")
);
const keplrWallet = computed(() =>
  unlockedWallets.value.find((w) => w.type === "keplr")
);

watch([mnemonic, newWalletName, newWalletPassword, seedBackedUp], () => {
  if (importError.value) importError.value = "";
});

function clearUnlockError(walletName) {
  if (unlockErrors[walletName]) delete unlockErrors[walletName];
}

function handleUnlockClick(wallet) {
  if (unlockLoading[wallet.name]) return;
  const input = document.querySelector(
    `[data-testid="unlock-password-${wallet.name}"]`
  );
  if (input && input.value && input.value.trim())
    handleInlineUnlock(wallet, input.value);
}

function isWalletUnlocked(wallet) {
  return unlockedWallets.value.some((w) => w.address === wallet.address);
}

function handleRemoveWallet(walletName) {
  const confirmed = window.confirm(
    `Remove wallet "${walletName}"? This cannot be undone.`
  );
  if (confirmed) removeNamedCosmJsWallet(walletName);
}

function handleRemoveAll() {
  if (localCosmJsWallets.value.length === 0) return;
  const walletCount = localCosmJsWallets.value.length;
  const confirmed = window.confirm(
    `Remove ALL ${walletCount} wallet${walletCount > 1 ? "s" : ""}? This cannot be undone.`
  );
  if (confirmed) {
    disconnectWallet();
    const walletsToRemove = [...localCosmJsWallets.value];
    walletsToRemove.forEach((wallet) => removeNamedCosmJsWallet(wallet.name));
  }
}

async function handleKeplr() {
  loading.value = true;
  keplrError.value = "";
  try {
    if (hasKeplrWallet.value) {
      const w = keplrWallet.value;
      if (w) lockWallet(w.name);
    } else {
      await connectExtension("keplr");
    }
  } catch (err) {
    console.error("Keplr operation failed:", err);
    keplrError.value = err.message || "Failed to connect to Keplr";
  } finally {
    loading.value = false;
  }
}

async function handleImport() {
  loading.value = true;
  importError.value = "";
  try {
    await importNamedCosmJsWallet(
      newWalletName.value.trim(),
      mnemonic.value.trim(),
      newWalletPassword.value
    );
    await connectNamedCosmJsWallet(
      newWalletName.value.trim(),
      newWalletPassword.value
    );
    mnemonic.value = "";
    newWalletName.value = "";
    newWalletPassword.value = "";
    seedBackedUp.value = false;
  } catch (err) {
    console.error("Wallet import failed:", err);
    importError.value = err.message || "Failed to import wallet";
  } finally {
    loading.value = false;
  }
}

function handleInlineUnlock(wallet, password) {
  if (!password.trim()) return;
  unlockLoading[wallet.name] = true;
  unlockErrors[wallet.name] = "";
  unlockWallet(wallet.name, password)
    .then(() => {
      const input = document.querySelector(
        `[data-testid="unlock-password-${wallet.name}"]`
      );
      if (input) input.value = "";
      delete unlockErrors[wallet.name];
    })
    .catch((err) => {
      console.error("Unlock failed:", err);
      unlockErrors[wallet.name] = err.message || "Invalid password";
    })
    .finally(() => {
      unlockLoading[wallet.name] = false;
    });
}

function generateSeed(numWords) {
  const seed = generateMnemonic(numWords);
  mnemonic.value = seed;
}

function handleDisconnectAll() {
  disconnectWallet();
  unlockedWallets.value.length = 0;
}
</script>
