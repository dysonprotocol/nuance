<template>
  <!-- Sidebar -->
  <div
    id="layout-sidebar"
    class="sidebar-menu sidebar-menu-activation transition-[margin,top,max-height,border-radius] duration-300 ease-in-out motion-reduce:transition-none bg-background/95"
  >
    <div class="relative min-h-0 grow">
      <div data-simplebar class="size-full overflow-y-auto">
        <div class="mt-4 px-2.5 pb-4 space-y-2">
          <div
            class="rounded-md bg-muted/60 p-3 text-[11px] text-muted-foreground space-y-1"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="truncate">Chain ID:</span>
              <span
                :class="[
                  'font-mono',
                  isNonMainnet ? 'text-destructive' : 'text-muted-foreground',
                ]"
              >
                {{ chainIdDisplay || "…" }}
              </span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="truncate">Height:</span>
              <span class="font-mono text-muted-foreground">{{
                latestHeight || "…"
              }}</span>
            </div>
            <div
              v-if="nodeVersion || nodeCommit"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">Version:</span>
              <span class="font-mono text-muted-foreground">
                <span v-if="nodeVersion">
                  <a
                    :href="nodeBranchUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="hover:text-foreground"
                    >{{ nodeVersion }}</a
                  >
                </span>
                <span v-if="nodeCommit">
                  -
                  <a
                    :href="nodeCommitUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="hover:text-foreground"
                    >{{ nodeCommit }}</a
                  >
                </span>
              </span>
            </div>
            <div
              v-if="dashCommit || dashBranch"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">Dashboard:</span>
              <span class="font-mono text-muted-foreground">
                <span v-if="dashBranch">
                  <a
                    :href="dashboardBranchUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="hover:text-foreground"
                    >{{ dashBranch }}</a
                  >
                </span>
                <span v-if="dashCommit">
                  -
                  <a
                    :href="dashboardCommitUrl"
                    target="_blank"
                    rel="noreferrer"
                    class="hover:text-foreground"
                    >{{ dashCommit }}</a
                  >
                </span>
              </span>
            </div>
          </div>
          

          <!-- Nuance links -->
          <nav class="space-y-2 flex flex-col">
            <router-link
              to="/nuance/recent"
              custom
              v-slot="{ href, navigate, isActive }"
            >
              <a :href="href" @click="navigate" :class="linkClass(isActive)">
                <SquareStack class="size-4" />
                <span>Nuance Recent</span>
              </a>
            </router-link>

            <router-link
              to="/nuance/topics/nuance"
              custom
              v-slot="{ href, navigate, isActive }"
            >
              <a :href="href" @click="navigate" :class="linkClass(isActive)">
                <Tag class="size-4" />
                <span>Nuance Topics</span>
              </a>
            </router-link>

            <router-link
              to="/wallets"
              custom
              v-slot="{ href, navigate, isActive }"
            >
              <a :href="href" @click="navigate" :class="linkClass(isActive)">
                <SquareStack class="size-4" />
                <span>Manage Wallets</span>
              </a>
            </router-link>

            <router-link
              to="/nuance/publish"
              custom
              v-slot="{ href, navigate, isActive }"
            >
              <a :href="href" @click="navigate" :class="linkClass(isActive)">
                <ArrowLeftRight class="size-4" />
                <span>Publish</span>
              </a>
            </router-link>
          </nav>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineOptions({ name: "AppSidebar" });
import KeplrCard from "@/components/wallet/KeplrCard.vue";
import CosmjsWallets from "@/components/wallet/CosmjsWallets.vue";
import { Tag, SquareStack, ArrowLeftRight } from "lucide-vue-next";
import { computed, onMounted } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { LatestBlock, NodeInfo } from "@/orm/models/base/TendermintService";

function linkClass(isActive) {
  const base =
    "w-full inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm justify-start transition-colors text-muted-foreground hover:text-foreground hover:bg-muted";
  if (isActive) return base + " bg-muted text-foreground";
  return base;
}

const latestBlockRepo = useRepo(LatestBlock);
const nodeInfoRepo = useRepo(NodeInfo);

const latest = computed(() => latestBlockRepo.find("default") || {});
const node = computed(() => nodeInfoRepo.find("default") || {});

const chainIdDisplay = computed(() =>
  String(node.value.network || latest.value.chain_id || "")
);
const latestHeight = computed(() =>
  latest.value.height ? String(latest.value.height) : ""
);
const isNonMainnet = computed(() => {
  const id = String(chainIdDisplay.value || "").toLowerCase();
  if (!id) return false;
  return !id.includes("mainnet");
});

const nodeVersion = computed(() => String(node.value.version || ""));
const nodeCommit = computed(() => String(node.value.git_commit || ""));

const nodeRepoUrl = "https://github.com/dysonprotocol/dysonprotocol2";
const dashRepoUrl = "https://github.com/dysonprotocol/dysonprotocol2-dashboard";
const nodeBranchUrl = computed(() =>
  nodeVersion.value ? `${nodeRepoUrl}/tree/${nodeVersion.value}` : "#"
);
const nodeCommitUrl = computed(() =>
  nodeCommit.value ? `${nodeRepoUrl}/commit/${nodeCommit.value}` : "#"
);

/* global __GIT_COMMIT__, __GIT_BRANCH__ */
const dashCommit = typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "";
const dashBranch = typeof __GIT_BRANCH__ !== "undefined" ? __GIT_BRANCH__ : "";
const dashboardBranchUrl = computed(() =>
  dashBranch ? `${dashRepoUrl}/tree/${dashBranch}` : "#"
);
const dashboardCommitUrl = computed(() =>
  dashCommit ? `${dashRepoUrl}/commit/${dashCommit}` : "#"
);

onMounted(() => {
  // Ensure NodeInfo is populated so version/commit render
  useAxiosRepo(NodeInfo).api().fetch();
});
</script>
