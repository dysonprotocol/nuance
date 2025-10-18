import { defineStore } from "pinia";
import { reactive } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";
import { usePostsStore, type PostDto } from "@/stores/nuance/posts.store";
import {
  idxRateList,
  idxRateCounts,
  Namespace,
} from "@/composables/useIndexBuilders";

export const useRatingsStore = defineStore("nuance_ratings", () => {
  const repo = useRepo(Storage);
  const api = useAxiosRepo(Storage).api();
  const postsStore = usePostsStore();

  type Counts = {
    up?: number;
    down?: number;
    bestRating?: number;
    hotRating?: number;
    earliestClaimTime?: number;
    claimedUdys?: number;
  };

  function key(ns: Namespace, tagName: string): string {
    return `${ns}:${tagName}`;
  }

  const lists = reactive(new Map<string, { hot: number[]; best: number[] }>());
  const counts = reactive(new Map<string, Map<number, Counts>>());
  const pagination = reactive(
    new Map<
      string,
      { hot?: { nextKey?: string }; best?: { nextKey?: string } }
    >()
  );

  const cacheTtlMs = 15_000;
  const fetchedAt = new Map<string, number>();

  function list(
    ns: Namespace,
    tagName: string,
    sort: "hot" | "best"
  ): Array<{ id: number; post: PostDto; up?: number; down?: number }> {
    const k = key(ns, tagName);
    const entry = lists.get(k);
    const ids = sort === "hot" ? entry?.hot || [] : entry?.best || [];
    const m = counts.get(k);
    return ids
      .map((id) => ({
        id,
        post: postsStore.get(id)!,
        up: m?.get(id)?.up,
        down: m?.get(id)?.down,
      }))
      .filter((x) => !!x.post);
  }

  function getCounts(
    ns: Namespace,
    tagName: string,
    id: number
  ): Counts | undefined {
    return counts.get(key(ns, tagName))?.get(id);
  }

  function getHotIndex(ns: Namespace, tagName: string, id: number): number {
    const entry = lists.get(key(ns, tagName));
    if (!entry) return -1;
    return (entry.hot || []).indexOf(id);
  }

  async function fetchList(
    owner: string,
    ns: Namespace,
    tagName: string,
    sort: "hot" | "best",
    limit = 5,
    prefetchPosts = true
  ) {
    const prefix = idxRateList(ns, tagName, sort);
    const k = key(ns, tagName);
    const page = pagination.get(k) || {};
    const nextKey = sort === "hot" ? page.hot?.nextKey : page.best?.nextKey;
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: nextKey,
      limit: String(limit),
      reverse: true,
    });
    const listRows = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0
        ? listRows.slice(-Number(res.returned))
        : [];
    const ids: number[] = [];
    for (const e of slice) {
      try {
        const j = JSON.parse(String(e.data || "")) as { id?: number };
        const id = Number(j.id || 0);
        if (id > 0) ids.push(id);
      } catch {
        /* ignore parse errors */
      }
    }
    if (prefetchPosts) {
      await Promise.all(ids.map((id) => postsStore.fetchById(owner, id)));
    }
    const curr = lists.get(k) || { hot: [], best: [] };
    const target = sort === "hot" ? curr.hot : curr.best;
    for (const id of ids) if (!target.includes(id)) target.push(id);
    lists.set(k, curr);
    const p = pagination.get(k) || {};
    if (sort === "hot") p.hot = { nextKey: res.next_key };
    else p.best = { nextKey: res.next_key };
    pagination.set(k, p);
    return { ids, next_key: res.next_key };
  }

  async function fetchCounts(
    owner: string,
    ns: Namespace,
    tagName: string,
    ids: number[],
    opts?: { force?: boolean }
  ) {
    const k = key(ns, tagName);
    const m = counts.get(k) || new Map<number, Counts>();
    const toFetch: Array<{ id: number; idx: string; ck: string }> = [];
    for (const id of ids) {
      const ck = `${k}:${id}`;
      if (
        !opts?.force &&
        m.has(id) &&
        Date.now() - (fetchedAt.get(ck) || 0) < cacheTtlMs
      )
        continue;
      toFetch.push({ id, idx: idxRateCounts(ns, tagName, id), ck });
    }
    if (toFetch.length) {
      await Promise.all(
        toFetch.map(({ idx }) => api.storageGet({ owner, index: idx }))
      );
      for (const { id, idx, ck } of toFetch) {
        const row = (
          repo.all() as Array<{ owner?: string; index?: string; data?: string }>
        ).find((e) => e.owner === owner && e.index === idx);
        if (!row) continue;
        try {
          const j = JSON.parse(String(row.data || "")) as {
            up?: number;
            down?: number;
            best_rating?: number;
            hot_rating?: number;
            metadata?: {
              earliest_claim_time?: number;
              claimed?: { udys?: number };
            };
          };
          m.set(id, {
            up: Number(j.up || 0),
            down: Number(j.down || 0),
            bestRating: Number(j.best_rating || 0),
            hotRating: Number(j.hot_rating || 0),
            earliestClaimTime: Number(j?.metadata?.earliest_claim_time || 0),
            claimedUdys: Number(j?.metadata?.claimed?.udys || 0),
          });
          fetchedAt.set(ck, Date.now());
        } catch {
          /* ignore parse errors */
        }
      }
    }
    counts.set(k, m);
  }

  // fetchItemData deprecated: fetchCounts now provides metadata

  return {
    lists,
    counts,
    pagination,
    list,
    getCounts,
    getHotIndex,
    fetchList,
    fetchCounts,
  };
});

export default useRatingsStore;
