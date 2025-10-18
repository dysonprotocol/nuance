import { defineStore } from "pinia";
import { reactive } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";
import { usePostsStore, type PostDto } from "@/stores/nuance/posts.store";
import {
  idxRateReplies,
  idxRateReplyCounts,
} from "@/composables/useIndexBuilders";

export const useRepliesStore = defineStore("nuance_replies", () => {
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

  const lists = reactive(new Map<number, { hot: number[]; best: number[] }>());
  const counts = reactive(new Map<number, Map<number, Counts>>());
  const pagination = reactive(
    new Map<
      number,
      { hot?: { nextKey?: string }; best?: { nextKey?: string } }
    >()
  );

  function list(
    postId: number,
    sort: "hot" | "best"
  ): Array<{ id: number; post: PostDto; up?: number; down?: number }> {
    const entry = lists.get(postId);
    const ids = sort === "hot" ? entry?.hot || [] : entry?.best || [];
    const postCounts = counts.get(postId);
    return ids
      .map((id) => ({
        id,
        post: postsStore.get(id)!,
        up: postCounts?.get(id)?.up,
        down: postCounts?.get(id)?.down,
      }))
      .filter((x) => !!x.post);
  }

  function getCounts(postId: number, replyId: number): Counts | undefined {
    return counts.get(postId)?.get(replyId);
  }

  function getHotIndex(postId: number, replyId: number): number {
    const entry = lists.get(postId);
    if (!entry) return -1;
    return (entry.hot || []).indexOf(replyId);
  }

  async function fetchList(
    owner: string,
    postId: number,
    sort: "hot" | "best",
    limit = 5,
    prefetchPosts = true
  ) {
    const prefix = idxRateReplies(postId, sort);
    const page = pagination.get(postId) || {};
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
    const curr = lists.get(postId) || { hot: [], best: [] };
    // keep storage-provided (reverse) order as ranked/newest-first
    const target = sort === "hot" ? curr.hot : curr.best;
    for (const id of ids) if (!target.includes(id)) target.push(id);
    lists.set(postId, curr);
    const p = pagination.get(postId) || {};
    if (sort === "hot") {
      p.hot = { nextKey: res.next_key };
    } else {
      p.best = { nextKey: res.next_key };
    }
    pagination.set(postId, p);
    return { ids, next_key: res.next_key };
  }

  async function fetchCounts(owner: string, postId: number, ids: number[]) {
    const m = counts.get(postId) || new Map<number, Counts>();
    for (const id of ids) {
      const idx = idxRateReplyCounts(postId, id);
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
        m.set(id, {
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
    counts.set(postId, m);
  }

  // fetchReplyData deprecated: counts now includes metadata

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

export default useRepliesStore;
