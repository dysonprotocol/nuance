import { ref, computed } from "vue";

const httpHost = ref<string>("");
const scriptName = ref<string>("");
const nuanceHost = ref<string>("");
const initialized = ref(false);

type NuanceBootCtx = {
  HTTP_HOST?: string;
  SCRIPT_NAME?: string;
  WHITELABEL?: boolean;
};

function readBootContext() {
  const ctx =
    (window as unknown as { NUANCE_CTX?: NuanceBootCtx }).NUANCE_CTX || {};
  httpHost.value = String(ctx.HTTP_HOST || "");
  scriptName.value = String(ctx.SCRIPT_NAME || "");
}

export const isWhitelabel = computed<boolean>(() => {
  const ctx =
    (window as unknown as { NUANCE_CTX?: NuanceBootCtx }).NUANCE_CTX || {};
  const flag = Boolean(ctx.WHITELABEL);
  if (flag) return true;
  const name = String(scriptName.value || ctx.SCRIPT_NAME || "");
  return !!name && name !== "nuance.dys";
});

async function initIfNeeded(): Promise<void> {
  if (initialized.value) return;
  readBootContext();
  const path = isWhitelabel.value
    ? "/redirect-to-dwapp/nuance.dys/host.json"
    : "/host.json";
  const res = await fetch(path);
  const data = await res.json();
  nuanceHost.value = String(data?.HTTP_HOST || "");
  initialized.value = true;
}

export function useNuanceContext() {
  void initIfNeeded();
  const authorName = computed<string>(() =>
    isWhitelabel.value ? scriptName.value : ""
  );
  return {
    httpHost,
    scriptName,
    isWhitelabel,
    nuanceHost,
    authorName,
    refresh: initIfNeeded,
  };
}

export default useNuanceContext;
