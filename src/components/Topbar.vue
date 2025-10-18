<template>
  <header id="navbar" class="max-w-3xl mx-auto" v-if="!isWhitelabel">
    <div>
      <h1 class="logo">
        <a href="/"> Nuance </a>
        <button
          class="btn btn-ghost ml-2"
          @click="cycleTheme"
          aria-label="Toggle theme"
        >
          <component :is="iconComp" class="h-5 w-5" />
        </button>
      </h1>
    </div>

    <div>
      <a href="/recent">Recent Posts</a> - The freshest posts Nuance has to
      offer<br />
      <a href="/active">Active Posts</a> - The busiest posts with active replies
      across all topics<br />
      <a href="/topics">Topics</a> - The best posts grouped by topic<br />
      <a href="/blog">Blog</a> - Read the official Nuance blog<br />
      <a href="/publish">Publish</a> - Share your best ideas<br />
      <a href="/wallets">Manage Wallet</a> - Organize your identities
    </div>
    <div class="mt-2">
      <IdentSelector
        v-model="selectedAuthorIdentity"
        :button-class="'btn btn-outline mr-2'"
      />
    </div>
  </header>
  <header id="navbar" class="max-w-3xl mx-auto px-4" v-else>
    <div class="flex items-center">
      <span class="">Powered by <a href="/"> Nuance </a></span>
      <button
        class="btn btn-ghost ml-2"
        @click="cycleTheme"
        aria-label="Toggle theme"
      >
        <component :is="iconComp" class="h-5 w-5" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import IdentSelector from "@/components/shared/IdentSelector.vue";
import { computed } from "vue";
import { useColorMode } from "@vueuse/core";
import { Sun, Moon, SunMoon } from "lucide-vue-next";
import { useWallet } from "@/composables/useWallet";
import { isWhitelabel } from "@/composables/useNuanceContext";

defineOptions({ name: "AppTopbar" });

const { selectedAuthorIdentity } = useWallet() as any;

const modes = ["light", "dark", "auto"] as const;
const mode = useColorMode({
  storageKey: "vueuse-color-scheme",
  selector: "html",
  attribute: "class",
  onChanged: (m, defaultHandler) => {
    defaultHandler(m);
    const root = document.documentElement;
    root.classList.remove("latex-dark", "latex-dark-auto");
    const mv = String(m);
    if (mv === "dark") root.classList.add("latex-dark");
    else if (mv === "auto") root.classList.add("latex-dark-auto");
  },
});

const currentMode = computed(() =>
  String(((mode as any).store?.value || mode.value) as any)
);
const iconComp = computed(() =>
  currentMode.value === "auto"
    ? SunMoon
    : currentMode.value === "light"
      ? Sun
      : Moon
);

function cycleTheme() {
  const current = ((mode as any).store?.value || mode.value) as
    | (typeof modes)[number]
    | string;
  const i = modes.indexOf(current as any);
  const next = modes[(i + 1) % modes.length];
  console.log("[theme] cycle click", { current, next });
  mode.value = next as any;
}
</script>
