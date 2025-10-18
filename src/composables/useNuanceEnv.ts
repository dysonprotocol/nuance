export function useNuanceEnv() {
  const ctx =
    (window as unknown as { NUANCE_CTX?: { SCRIPT_NAME?: string } })
      .NUANCE_CTX || {};
  const scriptName = String(ctx.SCRIPT_NAME || "nuance.dys");
  return { nuanceOwner: scriptName };
}
