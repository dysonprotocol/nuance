import { defineStore } from "pinia";
import { reactive } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { Storage } from "@/orm/models/storage/Storage";

export interface PostDto {
  postId: number;
  author: string;
  content: string;
  createdHeight: number;
  createdTime: string;
  updatedTime?: string;
  claimedUdys?: number;
}

function mapPostJson(data: string): PostDto | null {
  try {
    const j = JSON.parse(data || "{}");
    return {
      postId: Number(j.post_id || 0),
      author: String(j.author || ""),
      content: String(j.content || ""),
      createdHeight: Number(j.created_height || 0),
      createdTime: String(j.created_time || ""),
      updatedTime: j.updated_time ? String(j.updated_time) : undefined,
      claimedUdys: j.claimed?.udys ? Number(j.claimed.udys) : undefined,
    };
  } catch {
    return null;
  }
}

export const usePostsStore = defineStore("nuance_posts", () => {
  const repo = useRepo(Storage);
  const api = useAxiosRepo(Storage).api();

  const byId = reactive(new Map<number, PostDto>());
  const recent = reactive<number[]>([]);
  const byAuthor = reactive(new Map<string, number[]>());
  const pagination = reactive({
    recent: { nextKey: undefined as string | undefined },
    byAuthor: new Map<string, { nextKey?: string }>(),
  });

  const cacheTtlMs = 15_000;
  const fetchedAtById = new Map<number, number>();
  const inFlightById = new Map<number, Promise<PostDto | null>>();

  function get(id: number): PostDto | undefined {
    return byId.get(id);
  }
  function listRecent(): PostDto[] {
    const arr = recent
      .map((id: number) => byId.get(id)!)
      .filter(Boolean) as PostDto[];
    return arr.sort((a, b) => {
      const ha = Number(a.createdHeight || 0);
      const hb = Number(b.createdHeight || 0);
      if (hb !== ha) return hb - ha;
      const ta = new Date(a.createdTime).getTime() || 0;
      const tb = new Date(b.createdTime).getTime() || 0;
      return tb - ta;
    });
  }
  function listByAuthor(author: string): PostDto[] {
    const ids = byAuthor.get(author) || [];
    return ids.map((id: number) => byId.get(id)!).filter(Boolean) as PostDto[];
  }

  async function fetchById(owner: string, id: number) {
    const cached = byId.get(id);
    if (cached && Date.now() - (fetchedAtById.get(id) || 0) < cacheTtlMs)
      return cached;
    if (inFlightById.has(id)) return inFlightById.get(id)!;
    const index = `posts/${String(id).padStart(15, "0")}`;
    const p = (async () => {
      await api.storageGet({ owner, index });
      const row = (
        repo.all() as Array<{ owner?: string; index?: string; data?: string }>
      ).find((e) => e.index === index);
      if (!row) return null;
      const parsed = mapPostJson(String(row.data || ""));
      if (parsed && parsed.postId > 0) {
        byId.set(parsed.postId, parsed);
        fetchedAtById.set(parsed.postId, Date.now());
      }
      return parsed;
    })();
    inFlightById.set(id, p);
    try {
      return await p;
    } finally {
      inFlightById.delete(id);
    }
  }

  async function fetchRecent(owner: string, opts?: { limit?: number }) {
    const limit = String(opts?.limit ?? 10);
    const res = await api.storageList({
      owner,
      index_prefix: "posts/",
      next_key: pagination.recent.nextKey,
      limit,
      reverse: true,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith("posts/"));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const posts = slice
      .map((e) => mapPostJson(String(e.data || "")))
      .filter((x): x is PostDto => !!x);
    for (const p of posts) {
      byId.set(p.postId, p);
      if (!recent.includes(p.postId)) recent.push(p.postId);
    }
    // ensure newest-first after each page
    recent.sort((a, b) => {
      const pa = byId.get(a);
      const pb = byId.get(b);
      const ha = Number(pa?.createdHeight || 0);
      const hb = Number(pb?.createdHeight || 0);
      if (hb !== ha) return hb - ha;
      const ta = new Date(pa?.createdTime || 0).getTime() || 0;
      const tb = new Date(pb?.createdTime || 0).getTime() || 0;
      return tb - ta;
    });
    pagination.recent.nextKey = res.next_key;
    return { posts, next_key: res.next_key };
  }

  async function fetchByAuthor(
    owner: string,
    author: string,
    opts?: { limit?: number }
  ) {
    const prefix = `authors/${author}/posts/`;
    const limit = String(opts?.limit ?? 10);
    const page = pagination.byAuthor.get(author) || {};
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: page.nextKey,
      limit,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const posts = slice
      .map((e) => mapPostJson(String(e.data || "")))
      .filter((x): x is PostDto => !!x);
    const ids = byAuthor.get(author) || [];
    for (const p of posts) {
      byId.set(p.postId, p);
      if (!ids.includes(p.postId)) ids.push(p.postId);
    }
    byAuthor.set(author, ids);
    pagination.byAuthor.set(author, { nextKey: res.next_key });
    return { posts, next_key: res.next_key };
  }

  return {
    byId,
    get,
    listRecent,
    listByAuthor,
    fetchById,
    fetchRecent,
    fetchByAuthor,
    pagination,
  };
});

export default usePostsStore;
