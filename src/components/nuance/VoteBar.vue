<template>
  <div class="flex-col items-center gap-2">
    <div class="h-1 w-full overflow-hidden flex">
      <div :style="{ width: approvalPct + '%' }" class="bg-green-600"></div>
      <div :style="{ width: 100 - approvalPct + '%' }" class="bg-red-600"></div>
    </div>
  </div>
  <div class="flex justify-between">
    <span class="">
      <a href="#" class="" @click.prevent="vote('up')">Upvote</a>:
      {{ up || 0 }}
      ·
      <a href="#" class="" @click.prevent="vote('down')">Downvote</a>:
      {{ down || 0 }}
    </span>
    <div v-if="showClaimUI && isAuthor" class="mt-2 text-sm">
      <template v-if="canClaim">
        <button class="btn" @click.prevent="emitClaim">
          Claim {{ predictedDys }} DYS
        </button>
      </template>
      <template v-else>
        <span v-if="countdownSec > 0">Claim in {{ humanCountdown }}</span>
        <span v-else-if="!isTopTen">Not in top 10</span>
        <span v-else>Nothing to claim</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watchEffect } from "vue";
import { useNuanceApi } from "@/api/nuance-api";
import { useWallet } from "@/composables/useWallet";
import { useExecutor } from "@/composables/useExecutor";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";

const props = defineProps<{
  mode: "tag" | "reply";
  postId: number;
  tag?: string;
  replyId?: number;
  up?: number;
  down?: number;
  // Optional claim panel inputs (supplied by parent)
  claimMode?: "tag" | "reply";
  author?: string;
  earliestClaimTime?: number; // unix seconds
  hotIndex?: number;
  availableUdys?: number;
  isAuthorResolved?: boolean; // if parent already validated author match
}>();

const emit = defineEmits(["rated", "claim"]);

const { selectedAuthorIdentity, unlockedWallets } = useWallet() as any;
const { executorAddress } = useExecutor() as any;
const nameRepo = useRepo(NameResolution);
const nameApi = useAxiosRepo(NameResolution).api();
const { rateTag, rateReply } = useNuanceApi();

const approvalPct = computed(() => {
  const u = Number(props.up || 0);
  const d = Number(props.down || 0);
  const n = u + d;
  if (n <= 0) return 0;
  return Math.round((u / n) * 100);
});

const showClaimUI = computed(() => !!props.claimMode);

function toUdys(dys: number) {
  return Math.round((dys || 0) * 1_000_000);
}

const nowSec = () => Math.floor(Date.now() / 1000);

const countdownSec = computed(() => {
  const t = Number(props.earliestClaimTime || 0);
  const d = t - nowSec();
  return d > 0 ? d : 0;
});

import { formatRelativeTime } from "@/utils/time";

const humanCountdown = computed(() => {
  const t = Number(props.earliestClaimTime || 0) * 1000;
  if (t <= 0) return "";
  // Represent remaining time using the same formatRelativeTime function
  // We want time-until, not time-since: reuse formatter on a synthetic past time by subtracting
  const now = Date.now();
  const msRemaining = Math.max(0, t - now);
  return formatRelativeTime(new Date(now - msRemaining));
});

const isTopTen = computed(() => {
  const i = Number(props.hotIndex ?? -1);
  return i >= 0 && i < 10;
});

// Resolve author name to address if needed for author check
const resolvedAuthor = ref("");
async function resolveAuthorIfNeeded() {
  const a = String(props.author || "");
  if (!a.endsWith(".dys")) {
    resolvedAuthor.value = a;
    return;
  }
  await nameApi.resolve(a);
  const rec = (
    nameRepo.all() as Array<{ input?: string; address?: string }>
  ).find((x) => x.input === a);
  resolvedAuthor.value = String(rec?.address || "");
}

onMounted(resolveAuthorIfNeeded);

const isAuthor = computed(() => {
  if (props.isAuthorResolved === true) return true;
  const authorInput = String(props.author || "");
  if (!authorInput) return false;
  const sel = String(selectedAuthorIdentity?.value || "");
  // Allow explicit identity selection match (name or address)
  if (sel && sel === authorInput) return true;
  const addr = resolvedAuthor.value || authorInput;
  if (executorAddress?.value) return executorAddress.value === addr;
  const wallets = (unlockedWallets?.value || []) as Array<{ address: string }>;
  return wallets.some((w) => w.address === addr);
});

// Debug logging for tag claim UI assumptions
watchEffect(() => {
  if (props.mode !== "tag" || !props.claimMode) return;
  try {
    const wallets = (unlockedWallets?.value || []) as Array<{
      address: string;
    }>;
    console.debug("[VoteBar][tag] claim context", {
      author: props.author,
      resolvedAuthor: resolvedAuthor.value,
      selectedIdentity: String(selectedAuthorIdentity?.value || ""),
      executor: String(executorAddress?.value || ""),
      unlocked: wallets.map((w) => w.address),
      isAuthor: isAuthor.value,
      showClaimUI: showClaimUI.value,
      earliest: Number(props.earliestClaimTime || 0),
      countdownSec: countdownSec.value,
      humanCountdown: humanCountdown.value,
      hotIndex: Number(props.hotIndex ?? -1),
      isTopTen: isTopTen.value,
      availableUdys: Number(props.availableUdys || 0),
      predictedUdys: predictedUdys.value,
      canClaim: canClaim.value,
    });
  } catch (e) {
    console.debug("[VoteBar][tag] claim context logging failed", e);
  }
});

const predictedUdys = computed(() => {
  const avail = Number(props.availableUdys || 0);
  const idx = Number(props.hotIndex ?? -1);
  if (avail <= 0 || idx < 0) return 0;
  const power = 1 / Math.pow(2, idx + 1);
  return Math.floor(avail * power);
});

const predictedDys = computed(() =>
  Math.floor(predictedUdys.value / 1_000_000)
);

const canClaim = computed(
  () =>
    showClaimUI.value &&
    isAuthor.value &&
    isTopTen.value &&
    countdownSec.value === 0 &&
    predictedUdys.value > 0
);

function emitClaim() {
  if (!canClaim.value) return;
  emit("claim");
}

async function resolveSelectedToAddress(): Promise<string> {
  const sel: string = String(selectedAuthorIdentity?.value || "");
  if (!sel) return "";
  if (sel.endsWith(".dys")) {
    await nameApi.resolve(sel);
    const rec = (
      nameRepo.all() as Array<{ input?: string; address?: string }>
    ).find((r) => r.input === sel);
    return String(rec?.address || "");
  }
  return sel;
}

async function vote(kind: "up" | "down") {
  const exec = await resolveSelectedToAddress();
  if (!exec) {
    const msg = "Select a wallet in the top bar to vote.";
    (window as any).alert(msg);
    throw new Error(msg);
  }
  if (props.mode === "tag") {
    if (!props.tag) throw new Error("tag is required for VoteBar in tag mode");
    const res = await rateTag({
      tag: props.tag,
      postId: props.postId,
      rate: kind,
      amountUdys: toUdys(1),
      executorAddress: exec,
    });
    if (!res?.success) {
      const msg = (res as any)?.rawSendMsgsResponse?.rawLog || "Rate failed";
      (window as any).alert(msg);
      throw new Error(msg);
    }
  } else {
    if (!props.replyId)
      throw new Error("replyId is required for VoteBar in reply mode");
    const res = await rateReply({
      postId: props.postId,
      replyPostId: props.replyId,
      rate: kind,
      amountUdys: toUdys(1),
      executorAddress: exec,
    });
    if (!res?.success) {
      const msg = (res as any)?.rawSendMsgsResponse?.rawLog || "Rate failed";
      (window as any).alert(msg);
      throw new Error(msg);
    }
  }
  emit("rated");
}
</script>
