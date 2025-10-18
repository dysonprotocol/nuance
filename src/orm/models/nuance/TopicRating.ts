import { Model } from "pinia-orm";
import type { Request } from "@pinia-orm/axios";

// Represents rating counts for a post within a topic (tag)
export class TopicRating extends Model {
  static entity = "nu_topic_ratings";
  static primaryKey = ["tag", "post_id"];

  static fields() {
    return {
      tag: this.string(""),
      post_id: this.number(0),
      up: this.number(0),
      down: this.number(0),
      best_rating: this.number(0),
      hot_rating: this.number(0),
      earliest_claim_time: this.number(0),
      claimed_udys: this.number(0),
    };
  }

  static config = {
    axiosApi: {
      actions: {
        async fetchCounts(
          this: Request,
          owner: string,
          tag: string,
          postId: number
        ) {
          const idx = `rate_tags/tags/${tag}/${String(postId).padStart(15, "0")}`;
          return this.get(
            `/dysonprotocol/storage/v1/storage_get?${new URLSearchParams({ owner, index: idx })}`,
            {
              dataTransformer: ({
                data,
              }: {
                data: { entry?: { data?: string } };
              }) => {
                const raw = String(
                  (data?.entry as { data?: string } | undefined)?.data || ""
                );
                try {
                  const j = JSON.parse(raw) as {
                    up?: number;
                    down?: number;
                    best_rating?: number;
                    hot_rating?: number;
                    metadata?: {
                      earliest_claim_time?: number;
                      claimed?: { udys?: number };
                    };
                  };
                  return [
                    {
                      tag,
                      post_id: Number(postId || 0),
                      up: Number(j.up || 0),
                      down: Number(j.down || 0),
                      best_rating: Number(j.best_rating || 0),
                      hot_rating: Number(j.hot_rating || 0),
                      earliest_claim_time: Number(
                        j?.metadata?.earliest_claim_time || 0
                      ),
                      claimed_udys: Number(j?.metadata?.claimed?.udys || 0),
                    },
                  ];
                } catch {
                  return [
                    {
                      tag,
                      post_id: Number(postId || 0),
                      up: 0,
                      down: 0,
                      best_rating: 0,
                      hot_rating: 0,
                      earliest_claim_time: 0,
                      claimed_udys: 0,
                    },
                  ];
                }
              },
            }
          );
        },
        async fetchList(
          this: Request,
          params: {
            owner: string;
            tag: string;
            sort: "hot" | "best";
            limit?: string;
            next_key?: string;
          }
        ) {
          const { owner, tag, sort, limit, next_key } = params;
          const prefix = `rate/tags/${tag}/${sort}/`;
          const qs = new URLSearchParams({ owner, index_prefix: prefix });
          if (limit) qs.set("pagination.limit", limit);
          if (next_key) qs.set("pagination.key", next_key);
          qs.set("pagination.reverse", "true");
          let returned = 0;
          let nextKey: string | undefined;
          await this.get(`/dysonprotocol/storage/v1/storage_list?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                entries?: Array<{ data?: string }>;
                pagination?: { next_key?: string };
                returned?: number;
              };
            }) => {
              const list = Array.isArray(data?.entries) ? data!.entries! : [];
              nextKey = data?.pagination?.next_key || "";
              returned = list.length;
              const rows: Array<{ tag: string; post_id: number }> = [];
              for (const e of list) {
                try {
                  const j = JSON.parse(String(e?.data || "")) as {
                    id?: number;
                  };
                  const id = Number(j?.id || 0);
                  if (id > 0) rows.push({ tag, post_id: id });
                } catch {
                  // ignore
                }
              }
              return rows;
            },
          });
          return { next_key: nextKey, returned };
        },
      },
    },
  };
}

export default TopicRating;
