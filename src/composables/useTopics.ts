import { ref, computed } from "vue";
import { useAxiosRepo } from "@pinia-orm/axios";
import { useRepo } from "pinia-orm";
import { Storage } from "@/orm/models/storage/Storage";
import { useNuanceEnv } from "@/composables/useNuanceEnv";

type FeaturedTag = { tag: string; availableUdys: number; availableDys: number };
type SimpleTag = { tag: string };

export function useTopics() {
  const { nuanceOwner } = useNuanceEnv();
  const owner = String(nuanceOwner || "nuance.dys");
  const storageApi = useAxiosRepo(Storage).api();
  const storageRepo = useRepo(Storage);

  const isLoadingFeatured = ref(false);
  const featured = ref<FeaturedTag[]>([]);
  const featuredNextKey = ref<string | undefined>(undefined);

  const isLoadingAll = ref(false);
  const allTags = ref<SimpleTag[]>([]);
  const allNextKey = ref<string | undefined>(undefined);

  const query = ref("");
  const filteredAllTags = computed(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return allTags.value;
    return allTags.value.filter((t) => t.tag.toLowerCase().includes(q));
  });

  async function loadMoreFeatured(limit = "20") {
    if (isLoadingFeatured.value) return;
    isLoadingFeatured.value = true;
    try {
      const prefix = "available_rewards/tags/udys/";
      const res = await storageApi.storageList({
        owner,
        index_prefix: prefix,
        extract: "true",
        next_key: featuredNextKey.value,
        limit,
        reverse: true,
      });
      const list = (
        storageRepo.all() as Array<{
          owner?: string;
          index?: string;
          data?: string;
        }>
      ).filter(
        (e) => e.owner === owner && String(e.index || "").startsWith(prefix)
      );
      const slice =
        Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
      const mapped: FeaturedTag[] = slice
        .map((e) => {
          // Prefer JSON payload when present
          try {
            if (e.data) {
              const j = JSON.parse(String(e.data || "")) as {
                tag_name?: string;
                amount?: number;
              };
              if (j?.tag_name != null) {
                const amount = Number(j?.amount || 0);
                return {
                  tag: String(j.tag_name),
                  availableUdys: amount,
                  availableDys: amount / 1_000_000,
                };
              }
            }
          } catch {
            // fall through to index parsing
          }
          // Fallback: parse from index path: available_rewards/tags/udys/{amount15}/{tag}
          const idx = String(e.index || "");
          const parts = idx.split("/");
          // parts: ["available_rewards","tags","udys","{amount15}","{tag}"] or owner prefix omitted in index
          const amountStr = parts[3] || parts[4] || "0";
          const tagName = parts[4] || parts[5] || "";
          if (!tagName) return undefined;
          const amount = Number(amountStr);
          return {
            tag: tagName,
            availableUdys: amount,
            availableDys: amount / 1_000_000,
          };
        })
        .filter(Boolean) as FeaturedTag[];
      featured.value.push(...mapped);
      featuredNextKey.value = res.next_key;
    } finally {
      isLoadingFeatured.value = false;
    }
  }

  async function loadMoreAll(limit = "50") {
    if (isLoadingAll.value) return;
    isLoadingAll.value = true;
    try {
      const prefix = "tag/tags/";
      const res = await storageApi.storageList({
        owner,
        index_prefix: prefix,
        extract: "true",
        next_key: allNextKey.value,
        limit,
      });
      const list = (
        storageRepo.all() as Array<{
          owner?: string;
          index?: string;
          data?: string;
        }>
      ).filter(
        (e) => e.owner === owner && String(e.index || "").startsWith(prefix)
      );
      const slice =
        Number(res.returned || 0) > 0 ? list.slice(-Number(res.returned)) : [];
      const mapped: SimpleTag[] = slice
        .map((e) => {
          // Prefer JSON payload
          try {
            if (e.data) {
              const j = JSON.parse(String(e.data || "")) as {
                tag_name?: string;
              };
              if (j?.tag_name) return { tag: String(j.tag_name) };
            }
          } catch {
            // fall through
          }
          // Fallback: parse from index path: tag/tags/{tag}
          const idx = String(e.index || "");
          const parts = idx.split("/");
          const tagName = parts[2]
            ? parts.slice(2).join("/")
            : parts[parts.length - 1];
          return tagName ? { tag: tagName } : undefined;
        })
        .filter(Boolean) as SimpleTag[];
      allTags.value.push(...mapped);
      allNextKey.value = res.next_key;
    } finally {
      isLoadingAll.value = false;
    }
  }

  return {
    // featured
    featured,
    featuredNextKey,
    isLoadingFeatured,
    loadMoreFeatured,
    // all
    allTags,
    allNextKey,
    isLoadingAll,
    loadMoreAll,
    // filter
    query,
    filteredAllTags,
  };
}

export default useTopics;
