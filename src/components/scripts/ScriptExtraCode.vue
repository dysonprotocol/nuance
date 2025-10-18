<template>
  <div v-if="isUnlocked" class="w-full min-w-0">
    <Accordion
      type="single"
      collapsible
      v-model="accordionValue"
      class="border rounded-md hover:border-success"
    >
      <AccordionItem value="extra">
        <AccordionTrigger class="font-semibold">Extra Code</AccordionTrigger>
        <AccordionContent class="">
          <div class="min-w-0">
            <div class="h-28 w-full min-w-0 border rounded-sm">
              <MonacoEditor
                ref="monacoRef"
                v-model="extraCode"
                language="python"
                :theme="editorTheme"
                :line-number-offset="scriptLineCount"
              />
            </div>
            <div class="text-xs opacity-60 mt-1">
              This code will be temporarily appended before execution
            </div>

            <Alert
              v-if="errorText"
              variant="destructive"
              class="mt-3 break-all"
            >
              <AlertTitle>{{
                errorContext?.simulate
                  ? "Simulation Failed"
                  : "Execution Failed"
              }}</AlertTitle>
              <AlertDescription>
                <div class="font-medium text-xs opacity-80">Error:</div>
                <pre
                  class="text-xs p-2 mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words border rounded"
                  >{{ errorText }}</pre
                >
                <div v-if="exception" class="mt-2 text-xs">
                  <Button
                    variant="link"
                    class="h-auto p-0"
                    @click="goToException"
                    >Go to line {{ exception.lineno }}:{{
                      exception.col_offset
                    }}</Button
                  >
                </div>
              </AlertDescription>
            </Alert>

            <Alert v-if="result" class="mt-3 break-all">
              <AlertTitle
                >{{
                  result.simulate ? "Simulation" : "Execution"
                }}
                Successful</AlertTitle
              >
              <AlertDescription>
                <div v-if="result.result !== null" class="mt-2 w-full min-w-0">
                  <div class="font-medium text-xs opacity-80">Result:</div>
                  <div
                    class="mt-1 max-h-32 w-full max-w-full overflow-x-auto overflow-y-auto"
                  >
                    <pre
                      class="text-xs p-2 border rounded inline-block min-w-full whitespace-pre"
                      >{{ formatResult(result.result) }}</pre
                    >
                  </div>
                </div>
                <div v-if="result.stdout" class="mt-2 w-full min-w-0">
                  <div class="font-medium text-xs opacity-80">Output:</div>
                  <div
                    class="mt-1 max-h-32 w-full max-w-full overflow-x-auto overflow-y-auto"
                  >
                    <pre
                      class="text-xs p-2 border rounded inline-block min-w-full whitespace-pre"
                      >{{ result.stdout }}</pre
                    >
                  </div>
                </div>
                <div class="mt-2 text-xs opacity-80">
                  <template v-if="result.simulate">
                    <div>gas used: {{ result.txGasUsed }}</div>
                  </template>
                  <template v-else>
                    <div>gas limit: {{ result.txGasWanted }}</div>
                    <div>
                      efficiency:
                      {{ formatPercent(result.txGasUsed, result.txGasWanted) }}
                    </div>
                  </template>
                </div>
                <div
                  v-if="!result.simulate && result.txHash"
                  class="mt-2 text-xs break-all whitespace-pre-wrap w-full"
                >
                  <div class="font-medium text-xs opacity-80">Transaction:</div>
                  <div class="p-2 mt-1 rounded border">
                    <div>
                      Hash:
                      <TxHashDisplay :hash="result.txHash" :truncate="8" />
                    </div>
                    <div v-if="result.blockHeight">
                      Block: {{ result.blockHeight }}
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <div class="mt-3 flex justify-end">
              <div class="flex items-center gap-2">
                <Button
                  variant="secondary"
                  :disabled="
                    isSimulating || hasUnsavedChanges || !!validationError
                  "
                  @click="simulate"
                  >{{ isSimulating ? "Simulating..." : "Simulate" }}</Button
                >
                <Button
                  :disabled="
                    isExecuting || hasUnsavedChanges || !!validationError
                  "
                  @click="execute"
                  >{{ isExecuting ? "Sending..." : "Tx" }}</Button
                >
              </div>
            </div>
            <!-- Attach a coin transfer to this call (always visible) -->
            <div class="mt-3">
              <div class="text-sm mb-2">
                Attach coins - /cosmos.bank.v1beta1.MsgSend
              </div>
              <div class="mt-2">
                <AmountDenomSelector
                  :disabled="isSimulating || isExecuting"
                  :base-denoms="ownedBaseDenoms"
                  @update:base="onSendBaseUpdate"
                />
                <div
                  v-if="validationError"
                  class="text-destructive text-xs mt-1"
                >
                  {{ validationError }}
                </div>
                <div class="text-xs opacity-70 mt-1">
                  From
                  <span class="font-mono text-xs font-bold">
                    <AddressDisplay :address="props.address" :truncate="5" />
                  </span>
                  to
                  <span class="font-mono text-xs font-bold">
                    <AddressDisplay :address="props.address" :truncate="5" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useAppColorMode } from "@/composables/useAppColorMode";
import { useStorage } from "@vueuse/core";
import { useWallet } from "@/composables/useWallet";
import { useRepo } from "pinia-orm";
import { useGoToException } from "@/composables/useGoToException";
import TxHashDisplay from "@/components/TxHashDisplay.vue";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import MonacoEditor from "@/components/shared/MonacoEditor.vue";
import AmountDenomSelector from "@/components/AmountDenomSelector.vue";
import AddressDisplay from "@/components/AddressDisplay.vue";
// import { useRepo } from 'pinia-orm'
import { useAxiosRepo } from "@pinia-orm/axios";
import SpendableBalance from "@/orm/models/bank/SpendableBalance";
import Script from "@/orm/models/script/Script";
import DenomMetadata from "@/orm/models/bank/DenomMetadata";

const props = defineProps<{
  address: string;
  currentScriptContent?: string;
  hasUnsavedChanges?: boolean;
}>();
const emit = defineEmits(["focus-code"]);

const wallet = useWallet();
const { unlockedWallets } = wallet;

const extraCodeStorage = useStorage<Record<string, string>>(
  "script-extra-codes",
  {}
);
const extraCode = ref("");

const isCollapsedStore = useStorage<boolean>(
  "script-extra-code-collapsed",
  false
);
const isOpen = computed({
  get: () => !isCollapsedStore.value,
  set: (v: boolean) => (isCollapsedStore.value = !v),
});
const accordionValue = ref<string>(isOpen.value ? "extra" : "");
watch(isOpen, (v) => {
  const desired = v ? "extra" : "";
  if (accordionValue.value !== desired) accordionValue.value = desired;
});
watch(accordionValue, (v) => {
  isOpen.value = v === "extra";
});

const spendableApi = useAxiosRepo(SpendableBalance);
const spendableMap = ref(new Map<string, string>());
const ownedBaseDenoms = computed((): string[] =>
  Array.from(spendableMap.value.entries())
    .filter(
      ([, amount]) => /^\d+$/.test(String(amount)) && String(amount) !== "0"
    )
    .map(([denom]) => denom)
);

const monacoRef = ref<any>(null);
const { isDark } = useAppColorMode();
const editorTheme = computed(() => (isDark.value ? "vs-dark" : "vs"));

const externalLineOffset = ref<number | null>(null);
const scriptLineCount = computed(() => {
  if (externalLineOffset.value != null) return externalLineOffset.value;
  const content = props.currentScriptContent || "";
  if (!content) return 1;
  return content.split("\n").length;
});

const isExecuting = ref(false);
const isSimulating = ref(false);
const result = ref<any | null>(null);
const errorText = ref("");
const errorContext = ref<{ simulate: boolean } | null>(null);
const exception = ref<any | null>(null);
// Attach coins inputs
const sendBaseAmount = ref("");
const sendBaseDenom = ref("");
const validationError = computed(() => {
  const denom = String(sendBaseDenom.value || "").trim();
  const amt = String(sendBaseAmount.value || "").trim();
  if (!denom || !amt) return "";
  if (!/^\d+$/.test(amt)) return "Amount must be an integer in base units";
  if (amt === "0") return "Amount must be greater than 0";
  // If we don't have this denom yet, don't block; wait until balances are loaded
  if (!spendableMap.value.has(denom)) return "";
  const bal = spendableMap.value.get(denom) || "0";
  if (BigInt(amt) > BigInt(bal)) {
    const entered = DenomMetadata.normalize({ amount: amt, denom }).display;
    const spendable = DenomMetadata.normalize({ amount: bal, denom }).display;
    return `Insufficient funds. Spendable: ${spendable.amount} ${spendable.denom}. Entered: ${entered.amount} ${entered.denom}`;
  }
  return "";
});

function onSendBaseUpdate(v: any) {
  sendBaseAmount.value = v?.amount || "";
  sendBaseDenom.value = v?.denom || "";
}

const isUnlocked = computed(
  () =>
    unlockedWallets.value?.some((w: any) => w.address === props.address) ||
    false
);

function relayoutEditor() {
  monacoRef.value?.layout?.();
}

function formatResult(r: unknown) {
  if (typeof r === "string") return r;
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}

function formatPercent(used: any, wanted: any) {
  const u = Number(used);
  const w = Number(wanted);
  if (!Number.isFinite(u) || !Number.isFinite(w) || w <= 0) return "—";
  return Math.round((u / w) * 100) + "%";
}

async function call(simulate: boolean) {
  result.value = null;
  errorText.value = "";
  errorContext.value = null;
  exception.value = null;
  monacoRef.value?.clearDecorations?.();
  (simulate ? isSimulating : isExecuting).value = true;
  try {
    // Build optional attached bank send as JSON string
    const attached: any[] = [];
    const amt = sendBaseAmount.value?.trim?.() || "";
    const denom = sendBaseDenom.value?.trim?.() || "";
    if (/^\d+$/.test(amt) && denom !== "" && amt !== "0") {
      attached.push({
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        from_address: props.address,
        to_address: props.address,
        amount: [{ denom, amount: amt }],
      });
    }
    const args: any = {
      scriptAddress: props.address,
      functionName: "",
      kwargs: "",
      extraCode: extraCode.value,
      simulate,
      executorAddress: props.address,
      attachedMsg: attached,
    };
    const res: any = await useAxiosRepo(Script).api().runDysonScript(args);

    if (res.scriptResponse?.exception) {
      const ex = res.scriptResponse.exception;
      const msg = `${ex.context}: ${ex.msg}\nLine ${ex.lineno}, column ${ex.col_offset}\nCode: ${ex.source_segment}`;
      errorText.value = res.scriptResponse.stdout
        ? `${msg}\n\nOutput:\n${res.scriptResponse.stdout}`
        : msg;
      errorContext.value = { simulate };
      exception.value = ex;
      result.value = null;
    } else if (!res?.success) {
      const raw = res?.rawSendMsgsResponse?.raw;
      const rawLog = res?.rawSendMsgsResponse?.rawLog;
      const errMsg = raw?.message || rawLog || "Script execution failed";
      errorText.value = String(errMsg);
      errorContext.value = { simulate };
      result.value = null;
      exception.value = null;
    } else if (res.scriptResponse) {
      const txResp = res?.rawSendMsgsResponse?.raw?.tx_response;
      const txObj = res?.rawSendMsgsResponse?.raw?.tx;
      const simRaw = res?.rawSendMsgsResponse?.raw;
      const wanted = simulate
        ? Number(simRaw?.gas_info?.gas_wanted ?? NaN)
        : Number(txResp?.gas_wanted ?? txObj?.auth_info?.fee?.gas_limit ?? NaN);
      const used = simulate
        ? Number(simRaw?.gas_info?.gas_used ?? NaN)
        : Number(txResp?.gas_used ?? NaN);
      result.value = {
        result: res.scriptResponse.result,
        stdout: res.scriptResponse.stdout,
        gasConsumed: res.scriptResponse.script_gas_consumed,
        nodesExecuted: res.scriptResponse.nodes_called,
        simulate,
        txGasWanted: Number.isFinite(wanted) ? wanted : undefined,
        txGasUsed: Number.isFinite(used) ? used : undefined,
        txHash: !simulate ? txResp?.txhash : null,
        blockHeight: !simulate ? txResp?.height : null,
      };
      errorText.value = "";
      errorContext.value = null;
      exception.value = null;
    } else {
      const txResp = res?.rawSendMsgsResponse?.raw?.tx_response;
      const txObj = res?.rawSendMsgsResponse?.raw?.tx;
      const simRaw = res?.rawSendMsgsResponse?.raw;
      const wanted = simulate
        ? Number(simRaw?.gas_info?.gas_wanted ?? NaN)
        : Number(txResp?.gas_wanted ?? txObj?.auth_info?.fee?.gas_limit ?? NaN);
      const used = simulate
        ? Number(simRaw?.gas_info?.gas_used ?? NaN)
        : Number(txResp?.gas_used ?? NaN);
      result.value = {
        result: null,
        stdout: "",
        gasConsumed: 0,
        nodesExecuted: 0,
        simulate,
        txGasWanted: Number.isFinite(wanted) ? wanted : undefined,
        txGasUsed: Number.isFinite(used) ? used : undefined,
        txHash: !simulate ? txResp?.txhash : null,
        blockHeight: !simulate ? txResp?.height : null,
      };
      errorText.value = "";
      errorContext.value = null;
      exception.value = null;
    }
  } catch (err: any) {
    errorText.value = err?.message || String(err);
    errorContext.value = { simulate };
    result.value = null;
    exception.value = null;
  } finally {
    (simulate ? isSimulating : isExecuting).value = false;
  }
}

const simulate = () => call(true);
const execute = () => call(false);

// Removed Authz and external executor logic; executor is always the script address

function highlightError(ex: any) {
  if (!ex) return;
  if (!isOpen.value) isOpen.value = true;
  const startLine = Math.max(
    1,
    Number(ex.lineno || 1) - Number(scriptLineCount.value || 0)
  );
  const endLine = Math.max(
    1,
    Number(ex.end_lineno || Number(ex.lineno || 1)) -
      Number(scriptLineCount.value || 0)
  );
  const startCol = Number(ex.col_offset ?? 0) + 1;
  const endCol =
    Number(ex.end_col_offset ?? Number(ex.col_offset ?? 0) + 1) + 1;
  monacoRef.value?.highlightRange?.(startLine, startCol, endLine, endCol);
}

const { goToException: goTo } = useGoToException();
function goToException() {
  const ex = exception.value;
  if (!ex) return;
  goTo({
    exception: ex,
    baseLineCount: scriptLineCount.value,
    emitFocus: () => emit("focus-code"),
    highlightLocal: (e: any, baseLines: number) => {
      const adjusted = {
        ...e,
        _adjustedStartLine: Math.max(
          1,
          Number(e.lineno || 1) - Number(baseLines || 0)
        ),
        _adjustedEndLine: Math.max(
          1,
          Number(e.end_lineno || Number(e.lineno || 1)) - Number(baseLines || 0)
        ),
      };
      highlightError(adjusted);
    },
  });
}

watch(
  () => props.address,
  (addr) => {
    extraCode.value = extraCodeStorage.value[addr] || "";
    void refreshSpendables(addr);
  },
  { immediate: true }
);

watch(extraCode, (v) => {
  extraCodeStorage.value[props.address] = v;
});

async function refreshSpendables(addr: string) {
  console.log("refreshSpendables", addr);
  if (!addr) return;
  await spendableApi.api().fetchAll(addr);
  const repo = useRepo(SpendableBalance);
  const list = ((repo.all() as any[]) || []).filter(
    (s: any) => String(s.address) === addr
  );
  const m = new Map<string, string>();
  for (const s of list) m.set(String(s.denom), String(s.amount));
  spendableMap.value = m;
}

// executor is always the script address; balances are refreshed via props.address watch

onMounted(() => {
  if (props.address) void refreshSpendables(props.address);
  const handler = (e: any) => {
    const d = e?.detail;
    if (!d || d.address !== props.address) return;
    // If editor reports 0 lines (empty), start extra code on line 2 => offset=1
    externalLineOffset.value = Math.max(1, Number(d.lineCount || 0));
  };
  window.addEventListener("dyson:script-content-changed", handler);
  (onUnmounted as any)(() =>
    window.removeEventListener("dyson:script-content-changed", handler)
  );
});

watch(isOpen, async () => {
  await nextTick();
  relayoutEditor();
});

onMounted(() => {
  window.addEventListener("resize", relayoutEditor);
});
onUnmounted(() => {
  window.removeEventListener("resize", relayoutEditor);
});
</script>

<style scoped>
::deep(.monaco-error-inline) {
  background-color: rgba(244, 63, 94, 0.12);
  outline: 1px solid rgba(244, 63, 94, 0.5);
  cursor: pointer;
}
::deep(.monaco-error-line) {
  background-color: rgba(244, 63, 94, 0.12);
}
</style>
