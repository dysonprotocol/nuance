import { createRouter, createWebHistory, RouteRecordRaw } from "vue-router";
import { isWhitelabel, useNuanceContext } from "@/composables/useNuanceContext";
import { nuanceGlobalRoutes, authorWhitelabelRoutes } from "./modules/nuance";
import walletsRoutes from "./modules/wallets";

const routes: RouteRecordRaw[] = [
  ...walletsRoutes,
  ...(isWhitelabel.value ? authorWhitelabelRoutes : nuanceGlobalRoutes),
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  // Root landing behavior
  if (to.path === "/") {
    if (isWhitelabel.value) {
      return to.name === "AuthorHome" ? true : { name: "AuthorHome" };
    }
    return to.name === "NuanceRecent" ? true : { name: "NuanceRecent" };
  }

  // In whitelabel mode, externalize all non-root navigation to the Nuance host
  if (isWhitelabel.value) {
    const ctx = useNuanceContext();
    await ctx.refresh();
    const host = ctx.nuanceHost.value;
    if (!host) throw new Error("nuanceHost not initialized");
    const absolute = `${window.location.protocol}//${host}`;
    window.location.assign(absolute + to.fullPath);
    return false;
  }
});

export default router;
