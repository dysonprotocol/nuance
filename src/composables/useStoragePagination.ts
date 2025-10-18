import { ref } from "vue";
import { useRepo } from "pinia-orm";
import { Storage } from "@/orm/models/storage/Storage";

export interface ListArgs {
  owner: string;
  index_prefix: string;
  filter?: string;
  extract?: string;
  limit?: string;
}

export interface PageState<T> {
  items: T[];
  nextKey?: string;
  total?: string;
  isLoading: boolean;
  loadMore: () => Promise<void>;
  reset: () => void;
}

export function useStoragePagination<T = unknown>(
  mapEntry: (e: {
    owner: string;
    index: string;
    data: string;
    hash: string;
    updated_height: string;
    updated_timestamp: string;
  }) => T,
  args: ListArgs
): PageState<T> {
  const repo = useRepo(Storage);
  const items = ref<T[]>([]);
  const nextKey = ref<string | undefined>(undefined);
  const total = ref<string | undefined>(undefined);
  const isLoading = ref(false);

  async function fetchPage() {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
      const { owner, index_prefix, filter, extract, limit } = args;
      const res = await repo.api().storageList({
        owner,
        index_prefix,
        filter,
        extract,
        next_key: nextKey.value,
        limit,
      });
      total.value = res.total;
      const returned = Number(res.returned || 0);
      const next = res.next_key;
      // Read from repo to avoid duplicating mapping logic; we already got the list inserted
      const raw = (
        repo.all() as Array<{
          owner?: string;
          index?: string;
          data?: string;
          hash?: string;
          updated_height?: string;
          updated_timestamp?: string;
        }>
      ).filter(
        (e) =>
          e.owner === owner && String(e.index || "").startsWith(index_prefix)
      );
      // Map only new slice: cheap approach is to remap all and then de-dup via size; but we prefer append-only using returned count.
      if (returned > 0) {
        const slice = raw.slice(-returned);
        items.value.push(
          ...slice.map((e) =>
            mapEntry({
              owner: e.owner as string,
              index: e.index as string,
              data: e.data as string,
              hash: e.hash as string,
              updated_height: e.updated_height as string,
              updated_timestamp: e.updated_timestamp as string,
            })
          )
        );
      }
      // Guard against phantom next_key: if API gives next_key but returned==0, stop.
      nextKey.value = returned > 0 ? next : undefined;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadMore() {
    await fetchPage();
  }

  function reset() {
    items.value = [];
    nextKey.value = undefined;
    total.value = undefined;
  }

  return {
    items: items.value,
    nextKey: nextKey.value,
    total: total.value,
    isLoading: isLoading.value,
    loadMore,
    reset,
  } as unknown as PageState<T>;
}
