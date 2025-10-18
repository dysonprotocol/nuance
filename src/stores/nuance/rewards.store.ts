import { defineStore } from "pinia";
import { reactive } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";
import {
  idxTagRewards,
  idxFeaturedTopicsUdysPrefix,
  idxReplyRewards,
  idxActiveRepliesUdysPrefix,
} from "@/composables/useIndexBuilders";

type Rewards = {
  available: Record<string, number>;
  claimed: Record<string, number>;
};

export const useRewardsStore = defineStore("nuance_rewards", () => {
  const repo = useRepo(Storage);
  const api = useAxiosRepo(Storage).api();

  const tagRewards = reactive(new Map<string, Rewards>());
  const replyRewards = reactive(new Map<number, Rewards>());
  const featured = reactive<{
    items: Array<{ tag: string; amountUdys: number }>;
    nextKey?: string;
  }>({ items: [] });
  const active = reactive<{
    items: Array<{ postId: number; amountUdys: number }>;
    nextKey?: string;
  }>({ items: [] });

  function getTag(tag: string): Rewards | undefined {
    return tagRewards.get(tag);
  }

  function getReplies(postId: number): Rewards | undefined {
    return replyRewards.get(postId);
  }

  async function fetchTag(owner: string, tag: string) {
    const idx = idxTagRewards(tag);
    try {
      await api.storageGet({ owner, index: idx });
      const row = (
        repo.all() as Array<{ owner?: string; index?: string; data?: string }>
      ).find((e) => e.owner === owner && e.index === idx);
      if (!row) return;
      const j = JSON.parse(String(row.data || "{}")) as {
        available?: Record<string, number>;
        claimed?: Record<string, number>;
      };
      tagRewards.set(tag, {
        available: j.available || {},
        claimed: j.claimed || {},
      });
    } catch {
      // ignore
    }
  }

  async function fetchReplies(owner: string, postId: number) {
    const idx = idxReplyRewards(postId);
    try {
      await api.storageGet({ owner, index: idx });
      const row = (
        repo.all() as Array<{ owner?: string; index?: string; data?: string }>
      ).find((e) => e.owner === owner && e.index === idx);
      if (!row) return;
      const j = JSON.parse(String(row.data || "{}")) as {
        available?: Record<string, number>;
        claimed?: Record<string, number>;
      };
      replyRewards.set(postId, {
        available: j.available || {},
        claimed: j.claimed || {},
      });
    } catch {
      // ignore
    }
  }

  async function fetchFeatured(
    owner: string,
    opts?: { next_key?: string; limit?: number }
  ) {
    const prefix = idxFeaturedTopicsUdysPrefix();
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key || featured.nextKey,
      limit: String(opts?.limit ?? 25),
      reverse: true,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    for (const e of slice) {
      try {
        const j = JSON.parse(String(e.data || "")) as {
          tag_name?: string;
          amount?: number;
        };
        const lastSegment = (e.index || "").split("/").at(-1) || "";
        const tagSource = j.tag_name ?? lastSegment;
        const tag = String(tagSource || "");
        const amt = Number(j.amount || 0);
        if (!tag) continue;
        if (!featured.items.find((x) => x.tag === tag))
          featured.items.push({ tag, amountUdys: amt });
      } catch {
        // ignore parse errors
      }
    }
    featured.nextKey = res.next_key;
    return { items: featured.items, next_key: res.next_key };
  }

  async function fetchActive(
    owner: string,
    opts?: { next_key?: string; limit?: number }
  ) {
    const prefix = idxActiveRepliesUdysPrefix();
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key || active.nextKey,
      limit: String(opts?.limit ?? 25),
      reverse: true,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const pageItems: Array<{ postId: number; amountUdys: number }> = [];
    for (const e of slice) {
      try {
        const j = JSON.parse(String(e.data || "")) as {
          tag_name?: string;
          amount?: number;
        };
        const lastPostSegment = (e.index || "").split("/").at(-1) || "";
        const postIdSource = j.tag_name ?? lastPostSegment;
        const postId = Number(postIdSource || 0);
        const amt = Number(j.amount || 0);
        if (!postId) continue;
        if (!active.items.find((x) => x.postId === postId))
          active.items.push({ postId, amountUdys: amt });
        pageItems.push({ postId, amountUdys: amt });
      } catch {
        // ignore parse errors
      }
    }
    active.nextKey = res.next_key;
    return { items: pageItems, next_key: res.next_key };
  }

  return {
    tagRewards,
    replyRewards,
    featured,
    active,
    getTag,
    getReplies,
    fetchTag,
    fetchReplies,
    fetchFeatured,
    fetchActive,
  };
});

export default useRewardsStore;
