import { Model } from "pinia-orm";
import type { Request } from "@pinia-orm/axios";

// Historical claim snapshots per (tag, post, time)
export class TopicHistoricalRewards extends Model {
  static entity = "nu_topic_hist_rewards";
  static primaryKey = ["tag", "post_id", "time"];

  static fields() {
    return {
      tag: this.string(""),
      post_id: this.number(0),
      time: this.string(""), // ISO timestamp from script index
      hot_index: this.number(0),
      up: this.number(0),
      down: this.number(0),
      author_rewards: this.attr({} as Record<string, number>),
    };
  }

  static config = {
    axiosApi: {
      actions: {
        // List all entries under historical_rewards/tags/{tag}/{postId}
        async fetchSeries(
          this: Request,
          params: {
            owner: string;
            tag: string;
            postId: number;
            next_key?: string;
            limit?: string;
          }
        ) {
          const { owner, tag, postId, next_key, limit } = params;
          const prefix = `historical_rewards/tags/${tag}/${String(postId).padStart(15, "0")}`;
          const qs = new URLSearchParams({ owner, index_prefix: prefix });
          if (next_key) qs.set("pagination.key", next_key);
          if (limit) qs.set("pagination.limit", limit);
          // natural ascending time ordering ok; no reverse
          let nextKey: string | undefined;
          return this.get(`/dysonprotocol/storage/v1/storage_list?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                entries?: Array<{ index?: string; data?: string }>;
                pagination?: { next_key?: string };
              };
            }) => {
              const list = Array.isArray(data?.entries) ? data!.entries! : [];
              nextKey = data?.pagination?.next_key || "";
              const rows: Array<{
                tag: string;
                post_id: number;
                time: string;
                hot_index: number;
                up: number;
                down: number;
                author_rewards: Record<string, number>;
              }> = [];
              for (const e of list) {
                const idx = String(e?.index || "");
                const timePart = idx.split("/").at(-1) || "";
                try {
                  const j = JSON.parse(String(e?.data || "")) as {
                    hot_index?: number;
                    up?: number;
                    down?: number;
                    author_rewards?: Record<string, number>;
                  };
                  rows.push({
                    tag,
                    post_id: Number(postId || 0),
                    time: String(timePart || ""),
                    hot_index: Number(j.hot_index || 0),
                    up: Number(j.up || 0),
                    down: Number(j.down || 0),
                    author_rewards: (j.author_rewards || {}) as Record<
                      string,
                      number
                    >,
                  });
                } catch {
                  // ignore
                }
              }
              // Ensure chronological order by time string (ISO)
              rows.sort((a, b) =>
                a.time < b.time ? -1 : a.time > b.time ? 1 : 0
              );
              return rows;
            },
          }).then(() => ({ next_key: nextKey }));
        },
        // List all entries for a tag across all posts
        async fetchByTag(
          this: Request,
          params: {
            owner: string;
            tag: string;
            next_key?: string;
            limit?: string;
          }
        ) {
          const { owner, tag, next_key, limit } = params;
          const prefix = `historical_rewards/tags/${tag}/`;
          const qs = new URLSearchParams({ owner, index_prefix: prefix });
          if (next_key) qs.set("pagination.key", next_key);
          if (limit) qs.set("pagination.limit", limit);
          let nextKey: string | undefined;
          return this.get(`/dysonprotocol/storage/v1/storage_list?${qs}`, {
            dataTransformer: ({
              data,
            }: {
              data: {
                entries?: Array<{ index?: string; data?: string }>;
                pagination?: { next_key?: string };
              };
            }) => {
              const list = Array.isArray(data?.entries) ? data!.entries! : [];
              nextKey = data?.pagination?.next_key || "";
              const rows: Array<{
                tag: string;
                post_id: number;
                time: string;
                hot_index: number;
                up: number;
                down: number;
                author_rewards: Record<string, number>;
              }> = [];
              for (const e of list) {
                const idx = String(e?.index || "");
                const parts = idx.split("/");
                const postPad = parts.at(3) || "";
                const timePart = parts.at(4) || "";
                const postIdNum = Number(postPad);
                try {
                  const j = JSON.parse(String(e?.data || "")) as {
                    hot_index?: number;
                    up?: number;
                    down?: number;
                    author_rewards?: Record<string, number>;
                  };
                  rows.push({
                    tag,
                    post_id: Number.isFinite(postIdNum) ? postIdNum : 0,
                    time: String(timePart || ""),
                    hot_index: Number(j.hot_index || 0),
                    up: Number(j.up || 0),
                    down: Number(j.down || 0),
                    author_rewards: (j.author_rewards || {}) as Record<
                      string,
                      number
                    >,
                  });
                } catch {
                  // ignore
                }
              }
              rows.sort((a, b) =>
                a.time < b.time ? -1 : a.time > b.time ? 1 : 0
              );
              return rows;
            },
          }).then(() => ({ next_key: nextKey }));
        },
      },
    },
  };
}

export default TopicHistoricalRewards;
