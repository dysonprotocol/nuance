import { useRepo } from "pinia-orm";
import { Storage } from "@/orm/models/storage/Storage";

export interface TagRewardsDto {
  tagName: string;
  available: Record<string, number>;
  claimed: Record<string, number>;
}

function mapRewardsRow(data: string): TagRewardsDto | null {
  try {
    const j = JSON.parse(data || "{}");
    return {
      tagName: String(j.tag_name || ""),
      available: j.available || {},
      claimed: j.claimed || {},
    };
  } catch {
    return null;
  }
}

export function useRewards() {
  const repo = useRepo(Storage);

  async function fetchTagRewards(owner: string, tag: string) {
    const index = `tag/tags/${tag}`;
    await repo.api().storageGet({ owner, index });
    const row = repo
      .where("owner", (v: string) => v === owner)
      .where("index", (v: string) => v === index)
      .first();
    if (!row) return null;
    return mapRewardsRow(row.data as string);
  }

  async function fetchAvailableByDenom(
    owner: string,
    namespace: "tags" | "replies",
    denom: string,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `available_rewards/${namespace}/${denom}/`;
    const limit = String(opts?.limit ?? 10);
    const res = await repo
      .api()
      .storageList({
        owner,
        index_prefix: prefix,
        next_key: opts?.next_key,
        limit,
      });
    const list = repo
      .where("owner", (v: string) => v === owner)
      .where("index", (v: string) => v.startsWith(prefix))
      .get();
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const items = slice
      .map((e) => {
        try {
          const j = JSON.parse(e.data as string);
          return {
            tag_name: String(j.tag_name || ""),
            amount: Number(j.amount || 0),
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is { tag_name: string; amount: number } => x !== null);
    return { items, next_key: res.next_key };
  }

  return { fetchTagRewards, fetchAvailableByDenom };
}
