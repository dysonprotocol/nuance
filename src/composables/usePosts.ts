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
  _index?: string;
}

function mapPostJson(data: string, index: string): PostDto | null {
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
      _index: index,
    };
  } catch {
    return null;
  }
}

export function usePosts() {
  const repo = useRepo(Storage);
  const api = useAxiosRepo(Storage).api();

  async function fetchById(owner: string, id: number): Promise<PostDto | null> {
    const index = `posts/${String(id).padStart(15, "0")}`;
    // Fast path: if already in repo (from a list prefetch), avoid network
    const cached = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).find((e) => e.index === index) as
      | { data?: string; index?: string }
      | undefined;
    if (!cached) {
      await api.storageGet({ owner, index });
    }
    const row = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).find((e) => e.index === index) as
      | { data?: string; index?: string }
      | undefined;
    if (!row) return null;
    return mapPostJson(String(row.data || ""), String(row.index || index));
  }

  async function fetchRecent(
    owner: string,
    opts?: { limit?: number; next_key?: string }
  ) {
    const limit = String(opts?.limit ?? 10);
    const res = await api.storageList({
      owner,
      index_prefix: "posts/",
      next_key: opts?.next_key,
      limit,
      reverse: true,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith("posts/"));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const posts = slice
      .map((e) => mapPostJson(String(e.data || ""), String(e.index || "")))
      .filter((x): x is PostDto => x !== null);
    return { posts, next_key: res.next_key };
  }

  async function fetchByAuthor(
    owner: string,
    author: string,
    opts?: { limit?: number; next_key?: string }
  ) {
    const prefix = `authors/${author}/posts/`;
    const limit = String(opts?.limit ?? 10);
    const res = await api.storageList({
      owner,
      index_prefix: prefix,
      next_key: opts?.next_key,
      limit,
      reverse: true,
    });
    const list = (
      repo.all() as Array<{ owner?: string; index?: string; data?: string }>
    ).filter((e) => String(e.index || "").startsWith(prefix));
    const slice =
      Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
    const posts = slice
      .map((e) => mapPostJson(String(e.data || ""), String(e.index || "")))
      .filter((x): x is PostDto => x !== null);
    return { posts, next_key: res.next_key };
  }

  return { fetchById, fetchRecent, fetchByAuthor };
}
