import { useRepo } from "pinia-orm";
import { Storage } from "@/orm/models/storage/Storage";

export interface ReplyRateDto {
  tagName: string;
  id: number;
  up: number;
  down: number;
  bestRating: number;
  hotRating: number;
  metadata?: Record<string, unknown>;
}

function mapRateRow(data: string): ReplyRateDto | null {
  try {
    const j = JSON.parse(data || "{}");
    return {
      tagName: String(j.tag_name || ""),
      id: Number(j.id || 0),
      up: Number(j.up || 0),
      down: Number(j.down || 0),
      bestRating: Number(j.best_rating || 0),
      hotRating: Number(j.hot_rating || 0),
      metadata: j.metadata || undefined,
    };
  } catch {
    return null;
  }
}

export function useReplies() {
  const repo = useRepo(Storage);

  async function fetchBestReplies(
    owner: string,
    postId: number,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `rate/replies/${String(postId).padStart(15, "0")}/best/`;
    const limit = String(opts?.limit ?? 10);
    const res = await repo.api().storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key,
      limit,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter(
      (e) => e.owner === owner && String(e.index || "").startsWith(prefix)
    );
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const items = slice
      .map((e) => mapRateRow(e.data as string))
      .filter((x): x is ReplyRateDto => x !== null);
    return { items, next_key: res.next_key };
  }

  async function fetchHotReplies(
    owner: string,
    postId: number,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `rate/replies/${String(postId).padStart(15, "0")}/hot/`;
    const limit = String(opts?.limit ?? 10);
    const res = await repo.api().storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key,
      limit,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter(
      (e) => e.owner === owner && String(e.index || "").startsWith(prefix)
    );
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const items = slice
      .map((e) => mapRateRow(e.data as string))
      .filter((x): x is ReplyRateDto => x !== null);
    return { items, next_key: res.next_key };
  }

  async function fetchReply(
    owner: string,
    postId: number,
    replyPostId: number
  ) {
    const index = `rate_tags/replies/${String(postId).padStart(15, "0")}/${String(replyPostId).padStart(15, "0")}`;
    await repo.api().storageGet({ owner, index });
    const row = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).find((e) => e.owner === owner && e.index === index);
    if (!row) return null;
    return mapRateRow(String(row.data || ""));
  }

  return { fetchBestReplies, fetchHotReplies, fetchReply };
}
