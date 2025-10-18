import type { RouteRecordRaw } from "vue-router";

const Wallets = () => import("@/views/wallets/Wallets.vue");

const routes: RouteRecordRaw[] = [
  { path: "/wallets", name: "Wallets", component: Wallets },
];

export default routes;


