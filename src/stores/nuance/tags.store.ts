import { defineStore } from "pinia";
import { reactive } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";
import { usePostsStore, type PostDto } from "@/stores/nuance/posts.store";
import {
  idxRateTagCounts,
  idxRateTagList,
  idxAllTopicsPrefix,
} from "@/composables/useIndexBuilders";

export const useTagsStore = defineStore("nuance_tags", () => {
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

  const lists = reactive(new Map<string, { hot: number[]; best: number[] }>());
  const counts = reactive(new Map<string, Map<number, Counts>>());
  const pagination = reactive(
    new Map<
      string,
      { hot?: { nextKey?: string }; best?: { nextKey?: string } }
    >()
  );

  const allTopics = reactive<string[]>([]);
  const allPagination = reactive<{ nextKey?: string }>({});

  function list(
    tag: string,
    sort: "hot" | "best"
  ): Array<{ post: PostDto; up?: number; down?: number }> {
    const entry = lists.get(tag);
    const ids = sort === "hot" ? entry?.hot || [] : entry?.best || [];
    const tagCounts = counts.get(tag);
    return ids
      .map((id) => ({
        post: postsStore.get(id)!,
        up: tagCounts?.get(id)?.up,
        down: tagCounts?.get(id)?.down,
      }))
      .filter((x) => !!x.post);
  }

  function getCounts(tag: string, postId: number): Counts | undefined {
    return counts.get(tag)?.get(postId);
  }

  function getHotIndex(tag: string, postId: number): number {
    const entry = lists.get(tag);
    if (!entry) return -1;
    return (entry.hot || []).indexOf(postId);
  }

  async function fetchList(
    owner: string,
    tag: string,
    sort: "hot" | "best",
    limit = 10
  ) {
    const prefix = idxRateTagList(tag, sort);
    const page = pagination.get(tag) || {};
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
    const loaded = await Promise.all(
      ids.map((id) => postsStore.fetchById(owner, id))
    );
    const valid = loaded.filter((p): p is PostDto => !!p).map((p) => p.postId);
    const curr = lists.get(tag) || { hot: [], best: [] };
    // maintain newest/ranked-first order: append then leave order as storage provided (reverse sorted)
    const target = sort === "hot" ? curr.hot : curr.best;
    for (const id of valid) if (!target.includes(id)) target.push(id);
    lists.set(tag, curr);
    const p = pagination.get(tag) || {};
    if (sort === "hot") {
      p.hot = { nextKey: res.next_key };
    } else {
      p.best = { nextKey: res.next_key };
    }
    pagination.set(tag, p);
    return { ids: valid, next_key: res.next_key };
  }

  async function fetchCounts(owner: string, tag: string, ids: number[]) {
    const tagMap = counts.get(tag) || new Map<number, Counts>();
    for (const id of ids) {
      const idx = idxRateTagCounts(tag, id);
      await api.storageGet({ owner, index: idx });
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
        tagMap.set(id, {
          up: Number(j.up || 0),
          down: Number(j.down || 0),
          bestRating: Number(j.best_rating || 0),
          hotRating: Number(j.hot_rating || 0),
          earliestClaimTime: Number(j?.metadata?.earliest_claim_time || 0),
          claimedUdys: Number(j?.metadata?.claimed?.udys || 0),
        });
      } catch {
        /* ignore parse errors */
      }
    }
    counts.set(tag, tagMap);
  }

  // fetchTagPostData deprecated: counts now includes metadata

  return {
    lists,
    counts,
    pagination,
    list,
    getCounts,
    getHotIndex,
    fetchList,
    fetchCounts,
    allTopics,
    allPagination,
    fetchAll,
  };

  async function fetchAll(
    owner: string,
    opts?: { next_key?: string; limit?: number }
  ) {
    const prefix = idxAllTopicsPrefix();
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key || allPagination.nextKey,
      limit: String(opts?.limit ?? 50),
    });
    const listRows = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0
        ? listRows.slice(-Number(res.returned))
        : [];
    for (const e of slice) {
      try {
        const j = JSON.parse(String(e.data || "")) as { tag_name?: string };
        const tag = String(
          j.tag_name || (e.index || "").split("/").at(-1) || ""
        );
        if (tag && !allTopics.includes(tag)) allTopics.push(tag);
      } catch {
        /* ignore parse errors */
      }
    }
    allPagination.nextKey = res.next_key;
    return { tags: allTopics, next_key: res.next_key };
  }
});

export default useTagsStore;
