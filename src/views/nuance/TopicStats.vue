<template>
  <div class="max-w-3xl mx-auto p-4 space-y-6">
    <header class="text-center space-y-1">
      <h1 class="text-6xl font-semibold capitalize">{{ tag }}</h1>
      <div class="space-x-2 text-sm">
        <router-link
          class="underline"
          :class="{ 'font-bold': isHot }"
          :to="`/topics/${tag}/hot`"
        >
          Hot
        </router-link>
        <span>|</span>
        <router-link
          class="underline"
          :class="{ 'font-bold': isBest }"
          :to="`/topics/${tag}/best`"
        >
          Best
        </router-link>
        <span>|</span>
        <router-link
          class="underline"
          :class="{ 'font-bold': isStats }"
          :to="`/topics/${tag}/stats`"
        >
          Stats
        </router-link>
      </div>
      <div class="text-sm opacity-80">
        <span>Rewards available:</span>
        <strong>{{ availableDys }} DYS</strong>
        <span class="ml-2">Claimed:</span>
        <strong>{{ claimedDys }} DYS</strong>
      </div>
    </header>

    <section class="space-y-2">
      <h2 class="text-sm font-medium opacity-80">Hot Rankings over time</h2>
      <CChart
        v-if="hotCfg"
        type="line"
        :data="hotCfg.data"
        :options="hotCfg.options"
        class="w-full h-[400px]"
      />
    </section>

    <section class="space-y-2">
      <h2 class="text-sm font-medium opacity-80">Cumulative Rewards (udys)</h2>
      <CChart
        v-if="cumCfg"
        type="line"
        :data="cumCfg.data"
        :options="cumCfg.options"
        class="w-full h-[400px]"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useRewardsStore } from "@/stores/nuance/rewards.store";
import { CChart } from "@coreui/vue-chartjs";
import {
  Chart as ChartJS,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Title,
} from "chart.js";
import { useNuanceEnv } from "@/composables/useNuanceEnv";
import { useTopicChartService } from "@/orm/services/TopicChartService";
import { toLineChartData } from "@/orm/services/chartDataAdapters";
import { useRatingsStore } from "@/stores/nuance/ratings.store";

const route = useRoute();
const { nuanceOwner } = useNuanceEnv();
const tag = computed(() => String(route.params.tag || ""));
const rewardsStore = useRewardsStore();
const rewards = computed(() => rewardsStore.getTag(tag.value));
const availableUdysUdys = computed(() =>
  Number(rewards.value?.available?.udys || 0)
);
const availableDys = computed(() =>
  Math.floor(availableUdysUdys.value / 1_000_000)
);
const claimedDys = computed(() =>
  Math.floor(Number(rewards.value?.claimed?.udys || 0) / 1_000_000)
);

const isHot = computed(() => String(route.name) === "NuanceTopicHot");
const isBest = computed(() => String(route.name) === "NuanceTopicBest");
const isStats = computed(() => String(route.name) === "NuanceTopicStats");

const svc = useTopicChartService();
const ratings = useRatingsStore();

const hotCfg = ref<null | { data: any; options: any }>(null);
const cumCfg = ref<null | { data: any; options: any }>(null);

function toChartJsLine(adapter: {
  data: Array<Record<string, unknown>>;
  categories: string[];
  index: "t";
}) {
  const labels = adapter.data.map((r) => String(r[adapter.index] || ""));
  const datasets = adapter.categories.map((cat) => {
    return {
      label: cat,
      data: adapter.data.map((r) =>
        typeof r[cat] === "number" ? (r[cat] as number) : null
      ),
      spanGaps: true,
      showLine: true,
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.25,
    };
  });
  return { labels, datasets };
}

onMounted(async () => {
  if (!rewardsStore.getTag(tag.value))
    await rewardsStore.fetchTag(nuanceOwner, tag.value);
  // Ensure we have some top posts for the topic to seed series
  const res = await ratings.fetchList(
    nuanceOwner,
    "tags",
    tag.value,
    "hot",
    10
  );
  const ids = res.ids.slice(0, 5);

  // Hot: series of negative ranks at claim timestamps
  const hotMap = await svc.hotSeriesForPosts({
    owner: nuanceOwner,
    tag: tag.value,
    postIds: ids,
  });
  const hotAdapter = toLineChartData(hotMap, { label: (id) => `Post #${id}` });
  const hotData = toChartJsLine(hotAdapter);
  hotCfg.value = {
    data: { labels: hotData.labels, datasets: hotData.datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      plugins: { legend: { display: true }, title: { display: false } },
      scales: {
        x: {
          type: "category",
          title: { display: true, text: "Time" },
        },
        y: {
          title: { display: true, text: "Rank (1 is top)" },
          reverse: true,
        },
      },
      elements: { point: { radius: 3 } },
    },
  };

  // Cumulative rewards: true cumulative points only
  const cumMap = await svc.cumulativeRewardsSeries({
    owner: nuanceOwner,
    tag: tag.value,
    postIds: ids,
    denom: "udys",
  });
  const cumAdapter = toLineChartData(cumMap, { label: (id) => `Post #${id}` });
  const cumData = toChartJsLine(cumAdapter);
  cumCfg.value = {
    data: { labels: cumData.labels, datasets: cumData.datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      normalized: true,
      plugins: { legend: { display: true }, title: { display: false } },
      scales: {
        x: {
          type: "category",
          title: { display: true, text: "Time" },
        },
        y: { title: { display: true, text: "Cumulative (udys)" } },
      },
      elements: { point: { radius: 3 } },
    },
  };
});

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Title
);
</script>
