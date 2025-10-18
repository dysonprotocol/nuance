import { useRepo } from "pinia-orm";
import { Storage } from "@/orm/models/storage/Storage";

export interface TagRateDto {
  tagName: string;
  id: number;
  up: number;
  down: number;
  bestRating: number;
  hotRating: number;
  metadata?: Record<string, unknown>;
}

function mapRateRow(data: string): TagRateDto | null {
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

export function useTags() {
  const repo = useRepo(Storage);

  async function fetchHot(
    owner: string,
    tag: string,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `rate/tags/${tag}/hot/`;
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
      .map((e) =>
        mapRateRow(String((e as unknown as { data?: string }).data || ""))
      )
      .filter((x): x is TagRateDto => x !== null);
    return { items, next_key: res.next_key };
  }

  async function fetchBest(
    owner: string,
    tag: string,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `rate/tags/${tag}/best/`;
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
      .map((e) =>
        mapRateRow(String((e as unknown as { data?: string }).data || ""))
      )
      .filter((x): x is TagRateDto => x !== null);
    return { items, next_key: res.next_key };
  }

  async function fetchPostTag(owner: string, postId: number, tag: string) {
    const index = `rate_tags/tags/${tag}/${String(postId).padStart(15, "0")}`;
    await repo.api().storageGet({ owner, index });
    const row = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).find((e) => e.owner === owner && e.index === index);
    if (!row) return null;
    return mapRateRow(String((row as unknown as { data?: string }).data || ""));
  }

  async function fetchPostTagsBest(
    owner: string,
    postId: number,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `reverse_rates/tags/${String(postId).padStart(15, "0")}/best/`;
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
    // rows contain { tag_name } only; keep raw mapping
    const tags = slice
      .map((e) => {
        try {
          const j = JSON.parse(
            String((e as unknown as { data?: string }).data || "")
          );
          return String(j.tag_name || "");
        } catch {
          return "";
        }
      })
      .filter((t) => t);
    return { tags, next_key: res.next_key };
  }

  return { fetchHot, fetchBest, fetchPostTag, fetchPostTagsBest };
}
