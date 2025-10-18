import { useAxiosRepo } from "@pinia-orm/axios";
import { useRepo } from "pinia-orm";
import TopicRating from "@/orm/models/nuance/TopicRating";
import TopicRewards from "@/orm/models/nuance/TopicRewards";
import TopicHistoricalRewards from "@/orm/models/nuance/TopicHistoricalRewards";
import TopicTopContributor from "@/orm/models/nuance/TopicTopContributor";

export type LinePoint = { t: string; y: number; id?: number; label?: string };

export function useTopicChartService() {
  // Keep apis for side-effect fetches and transforms
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ratingApi = useAxiosRepo(TopicRating).api();
  const rewardsApi = useAxiosRepo(TopicRewards).api();
  const histApi = useAxiosRepo(TopicHistoricalRewards).api();
  const contribApi = useAxiosRepo(TopicTopContributor).api();

  async function hotSeriesForPosts(args: {
    owner: string;
    tag: string;
    postIds: number[];
  }): Promise<Record<number, LinePoint[]>> {
    const out: Record<number, LinePoint[]> = {};
    const postIds = Array.isArray(args.postIds) ? args.postIds : [];
    if (postIds.length > 0) {
      for (const id of postIds) {
        const s: LinePoint[] = [];
        await histApi.fetchSeries({
          owner: args.owner,
          tag: args.tag,
          postId: id,
        });
        const list = (
          useRepo(TopicHistoricalRewards).all() as Array<{
            tag?: string;
            post_id?: number;
            time?: string;
            hot_index?: number;
          }>
        ).filter((r) => r.tag === args.tag && Number(r.post_id) === id);
        for (const r of list) {
          const t = String(r.time || "");
          const rank = Number(r.hot_index || 0) + 1;
          const y = rank;
          s.push({ t, y, id });
        }
        out[id] = s.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
      }
      // If we produced any data, return it
      if (Object.values(out).some((arr) => arr.length > 0)) return out;
    }
    // Fallback: scan all historical entries for the tag and group by post_id
    await histApi.fetchByTag({ owner: args.owner, tag: args.tag });
    const rows = (
      useRepo(TopicHistoricalRewards).all() as Array<{
        tag?: string;
        post_id?: number;
        time?: string;
        hot_index?: number;
      }>
    ).filter((r) => r.tag === args.tag);
    for (const r of rows) {
      const id = Number(r.post_id || 0);
      if (!id) continue;
      const t = String(r.time || "");
      const rank = Number(r.hot_index || 0) + 1;
      const y = rank;
      if (!out[id]) out[id] = [];
      out[id].push({ t, y, id });
    }
    for (const id of Object.keys(out))
      out[Number(id)] = out[Number(id)].sort((a, b) =>
        a.t < b.t ? -1 : a.t > b.t ? 1 : 0
      );
    return out;
  }

  async function cumulativeRewardsSeries(args: {
    owner: string;
    tag: string;
    postIds: number[];
    denom?: string;
  }): Promise<Record<number, LinePoint[]>> {
    const denom = args.denom || "udys";
    const out: Record<number, LinePoint[]> = {};
    const postIds = Array.isArray(args.postIds) ? args.postIds : [];
    if (postIds.length > 0) {
      for (const id of postIds) {
        const series: LinePoint[] = [];
        await histApi.fetchSeries({
          owner: args.owner,
          tag: args.tag,
          postId: id,
        });
        const list = (
          useRepo(TopicHistoricalRewards).all() as Array<{
            tag?: string;
            post_id?: number;
            time?: string;
            author_rewards?: Record<string, number>;
          }>
        ).filter((r) => r.tag === args.tag && Number(r.post_id) === id);
        let acc = 0;
        for (const r of list.sort((a, b) =>
          String(a.time) < String(b.time) ? -1 : 1
        )) {
          const delta = Number((r.author_rewards || {})[denom] || 0);
          acc += delta;
          series.push({ t: String(r.time || ""), y: acc, id });
        }
        out[id] = series;
      }
      if (Object.values(out).some((arr) => arr.length > 0)) return out;
    }
    // Fallback: build from all tag rows
    await histApi.fetchByTag({ owner: args.owner, tag: args.tag });
    const rows = (
      useRepo(TopicHistoricalRewards).all() as Array<{
        tag?: string;
        post_id?: number;
        time?: string;
        author_rewards?: Record<string, number>;
      }>
    ).filter((r) => r.tag === args.tag);
    const grouped = new Map<number, Array<{ t: string; delta: number }>>();
    for (const r of rows) {
      const id = Number(r.post_id || 0);
      if (!id) continue;
      const t = String(r.time || "");
      const delta = Number((r.author_rewards || {})[denom] || 0);
      const arr = grouped.get(id) || [];
      arr.push({ t, delta });
      grouped.set(id, arr);
    }
    for (const [id, arr] of grouped) {
      arr.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
      let acc = 0;
      out[id] = arr.map(({ t, delta }) => {
        acc += delta;
        return { t, y: acc, id };
      });
    }
    return out;
  }

  async function topSupporters(args: {
    owner: string;
    tag: string;
    denom?: string;
    limit?: string;
  }): Promise<Array<{ contributor: string; amount: number }>> {
    const denom = args.denom || "udys";
    await contribApi.fetchByTagDenom({
      owner: args.owner,
      tag: args.tag,
      denom,
      limit: args.limit,
    });
    const rows = (
      useRepo(TopicTopContributor).all() as Array<{
        tag?: string;
        denom?: string;
        contributor?: string;
        amount?: number;
      }>
    ).filter((r) => r.tag === args.tag && r.denom === denom);
    return rows.map((r) => ({
      contributor: String(r.contributor || ""),
      amount: Number(r.amount || 0),
    }));
  }

  async function featuredTopicAggregates(args: {
    owner: string;
    limit?: string;
  }): Promise<{
    rewardsByTag: Array<{ tag: string; udys_amount: number }>;
  }> {
    await rewardsApi.fetchFeatured({
      owner: args.owner,
      limit: args.limit,
    });
    // Not persisted; caller can use the Promise result directly if needed
    return { rewardsByTag: [] };
  }

  return {
    hotSeriesForPosts,
    cumulativeRewardsSeries,
    topSupporters,
    featuredTopicAggregates,
  };
}

export default useTopicChartService;
