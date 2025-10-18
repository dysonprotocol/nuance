import { Model } from "pinia-orm";
import { useRepo } from "pinia-orm";
import type { Request } from "@pinia-orm/axios";

type StorageEntry = {
  owner?: string;
  index?: string;
  data?: string;
  updated_height?: string | number;
  updated_timestamp?: string;
  hash?: string;
};

type ListResponse = {
  entries?: StorageEntry[];
  pagination?: { next_key?: string; total?: string | number };
};

export class Storage extends Model {
  static entity = "storage_entries";
  static primaryKey = ["owner", "index", "extract"];

  static fields() {
    return {
      owner: this.string(""),
      index: this.string(""),
      extract: this.string(""),
      data: this.string(""),
      updated_height: this.string("0"),
      updated_timestamp: this.string(""),
      hash: this.string(""),
    };
  }

  static config = {
    axiosApi: {
      actions: {
        async storageGet(
          this: Request,
          params: { owner: string; index: string; extract?: string }
        ) {
          const { owner, index, extract } = params;
          const qs = new URLSearchParams({ owner, index });
          if (extract) qs.set("extract", extract);
          return this.get(`/dysonprotocol/storage/v1/storage_get?${qs}`, {
            dataTransformer: ({ data }: { data: { entry?: StorageEntry } }) => {
              const e = data?.entry || {};
              const ownerS = String(e?.owner || owner || "");
              const indexS = String(e?.index || index || "");
              if (!ownerS || !indexS) return [];
              return [
                {
                  owner: ownerS,
                  index: indexS,
                  extract: String(extract || ""),
                  data: String(e?.data || ""),
                  updated_height: String(e?.updated_height ?? "0"),
                  updated_timestamp: String(e?.updated_timestamp || ""),
                  hash: String(e?.hash || ""),
                },
              ];
            },
          });
        },
        async storageList(
          this: Request,
          params: {
            owner: string;
            index_prefix: string;
            filter?: string;
            extract?: string;
            next_key?: string;
            limit?: string;
            reverse?: boolean;
          }
        ): Promise<{
          next_key?: string;
          total?: string;
          returned?: number;
          limit?: string;
        }> {
          const { owner, index_prefix, filter, extract, limit } = params;
          const qs = new URLSearchParams({ owner, index_prefix });
          if (filter) qs.set("filter", filter);
          if (extract) qs.set("extract", extract);
          if (params.next_key) qs.set("pagination.key", params.next_key);
          if (limit) qs.set("pagination.limit", limit);
          if (params.reverse)
            qs.set("pagination.reverse", String(params.reverse));
          let nextKey: string | undefined;
          let total: string | undefined;
          let returned = 0;
          await this.get(`/dysonprotocol/storage/v1/storage_list?${qs}`, {
            dataTransformer: ({ data }: { data: ListResponse }) => {
              const list = Array.isArray(data?.entries) ? data.entries : [];
              returned = list.length;
              nextKey = data?.pagination?.next_key || "";
              const tot = data?.pagination?.total;
              total =
                typeof tot === "number"
                  ? String(tot)
                  : (tot as string | undefined);
              return list
                .filter((e) => e?.owner && e?.index)
                .map((e) => ({
                  owner: String(e.owner),
                  index: String(e.index),
                  extract: String(extract || ""),
                  data: String(e.data || ""),
                  updated_height: String(e.updated_height ?? "0"),
                  updated_timestamp: String(e.updated_timestamp || ""),
                  hash: String(e.hash || ""),
                }));
            },
          });
          return { next_key: nextKey || undefined, total, returned, limit };
        },
        async storageSet(
          this: Request,
          params: {
            owner: string;
            index: string;
            data: string;
            wallet: {
              sendMsg: (args: {
                msg: unknown;
                gasLimit?: number | "auto";
                memo?: string;
                executorAddress?: string;
                grantee?: string;
              }) => Promise<{ success: boolean; rawLog?: string }>;
            };
            gasLimit?: number | "auto";
            memo?: string;
            grantee?: string;
          }
        ) {
          const { owner, index, data, wallet, gasLimit, memo, grantee } =
            params;
          const msg = {
            "@type": "/dysonprotocol.storage.v1.MsgStorageSet",
            owner,
            index,
            data,
          };
          const res = await wallet.sendMsg({
            msg,
            gasLimit,
            memo,
            executorAddress: owner,
            grantee,
          });
          if (!res?.success)
            throw new Error(res?.rawLog || "Storage set failed");
          await this.storageGet({ owner, index });
          return res;
        },
        async storageDelete(
          this: Request,
          params: {
            owner: string;
            indexes: string[];
            wallet: {
              sendMsg: (args: {
                msg: unknown;
                gasLimit?: number | "auto";
                memo?: string;
                executorAddress?: string;
                grantee?: string;
              }) => Promise<{ success: boolean; rawLog?: string }>;
            };
            gasLimit?: number | "auto";
            memo?: string;
            grantee?: string;
          }
        ) {
          const { owner, indexes, wallet, gasLimit, memo, grantee } = params;
          const msg = {
            "@type": "/dysonprotocol.storage.v1.MsgStorageDelete",
            owner,
            indexes,
          };
          const res = await wallet.sendMsg({
            msg,
            gasLimit,
            memo,
            executorAddress: owner,
            grantee,
          });
          if (!res?.success)
            throw new Error(res?.rawLog || "Storage delete failed");
          // Remove deleted entries from local store across all extract variants
          const repo = useRepo(Storage);
          indexes.forEach((idx) => {
            repo
              .where("owner", (v: string) => v === owner)
              .where("index", (v: string) => v === idx)
              .delete();
          });
          return res;
        },
      },
    },
  };
}

export default Storage;
