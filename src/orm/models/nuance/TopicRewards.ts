import { Model } from "pinia-orm";
import type { Request } from "@pinia-orm/axios";

type Rewards = {
  available: Record<string, number>;
  claimed: Record<string, number>;
};

// Rewards snapshot for a topic (tag)
export class TopicRewards extends Model {
  static entity = "nu_topic_rewards";
  static primaryKey = "tag";

  static fields() {
    return {
      tag: this.string(""),
      available: this.attr({} as Record<string, number>),
      claimed: this.attr({} as Record<string, number>),
    };
  }

  static config = {
    axiosApi: {
      actions: {
        async fetch(this: Request, owner: string, tag: string) {
          const idx = `tag/tags/${tag}`;
          const qs = new URLSearchParams({ owner, index: idx });
          return this.get(`/dysonprotocol/storage/v1/storage_get?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: { entry?: { data?: string } };
            }) => {
              const raw = String(
                (data?.entry as { data?: string } | undefined)?.data || ""
              );
              const j = (() => {
                try {
                  return JSON.parse(raw) as Rewards;
                } catch {
                  return { available: {}, claimed: {} } as Rewards;
                }
              })();
              return [
                { tag, available: j.available || {}, claimed: j.claimed || {} },
              ];
            },
          });
        },
        async fetchFeatured(
          this: Request,
          params: { owner: string; next_key?: string; limit?: string }
        ) {
          const { owner, next_key, limit } = params;
          const prefix = "available_rewards/tags/udys/";
          const qs = new URLSearchParams({ owner, index_prefix: prefix });
          if (next_key) qs.set("pagination.key", next_key);
          if (limit) qs.set("pagination.limit", limit);
          qs.set("pagination.reverse", "true");
          let nextKey: string | undefined;
          return this.get(`/dysonprotocol/storage/v1/storage_list?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                entries?: Array<{ data?: string }>;
                pagination?: { next_key?: string };
              };
            }) => {
              const list = Array.isArray(data?.entries) ? data!.entries! : [];
              nextKey = data?.pagination?.next_key || "";
              return list
                .map((e) => {
                  try {
                    const j = JSON.parse(String(e?.data || "")) as {
                      tag_name?: string;
                      amount?: number;
                    };
                    return {
                      tag: String(j.tag_name || ""),
                      udys_amount: Number(j.amount || 0),
                    };
                  } catch {
                    return null;
                  }
                })
                .filter(
                  (x): x is { tag: string; udys_amount: number } =>
                    !!x && !!x.tag
                );
            },
          }).then((res) => ({ next_key: nextKey, res }));
        },
      },
    },
  };
}

export default TopicRewards;
