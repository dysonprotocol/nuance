import { Model } from "pinia-orm";
import type { Request } from "@pinia-orm/axios";

// Reverse index top contributors under top_tag_contributor/tags/{tag}/{denom}/{amount}/{contributor}
export class TopicTopContributor extends Model {
  static entity = "nu_topic_top_contrib";
  static primaryKey = ["tag", "denom", "amount", "contributor"];

  static fields() {
    return {
      tag: this.string(""),
      denom: this.string(""),
      amount: this.number(0),
      contributor: this.string(""),
    };
  }

  static config = {
    axiosApi: {
      actions: {
        // List by tag and denom, ordered by amount descending via reverse prefix order
        async fetchByTagDenom(
          this: Request,
          params: {
            owner: string;
            tag: string;
            denom: string;
            next_key?: string;
            limit?: string;
          }
        ) {
          const { owner, tag, denom, next_key, limit } = params;
          const prefix = `top_tag_contributor/tags/${tag}/${denom}/`;
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
                entries?: Array<{ index?: string; data?: string }>;
                pagination?: { next_key?: string };
              };
            }) => {
              const list = Array.isArray(data?.entries) ? data!.entries! : [];
              nextKey = data?.pagination?.next_key || "";
              return list
                .map((e) => {
                  try {
                    const j = JSON.parse(String(e?.data || "")) as {
                      contributor?: string;
                      denom?: string;
                      amount?: number;
                    };
                    return {
                      tag,
                      denom: String(j.denom || denom),
                      amount: Number(j.amount || 0),
                      contributor: String(j.contributor || ""),
                    };
                  } catch {
                    return null;
                  }
                })
                .filter(
                  (
                    x
                  ): x is {
                    tag: string;
                    denom: string;
                    amount: number;
                    contributor: string;
                  } => !!x && !!x.contributor
                );
            },
          }).then((_) => ({ next_key: nextKey }));
        },
      },
    },
  };
}

export default TopicTopContributor;
