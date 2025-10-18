import type { LinePoint } from "@/orm/services/TopicChartService";

export type LineChartInput = Record<string | number, LinePoint[]>;

export function toLineChartData(
  seriesMap: LineChartInput,
  opts?: { label?: (id: string) => string }
) {
  const label = opts?.label || ((id: string) => id);
  const ids = Object.keys(seriesMap);
  const timeSet = new Set<string>();
  for (const id of ids) for (const p of seriesMap[id] || []) timeSet.add(p.t);
  const times = Array.from(timeSet).sort();
  const categories = ids.map((id) => label(String(id)));
  const data: Array<Record<string, unknown>> = [];
  for (const t of times) {
    const row: Record<string, unknown> = { t };
    for (const id of ids) {
      const key = label(String(id));
      const s = seriesMap[id] || [];
      const pt = s.find((p) => p.t === t);
      // Use undefined for missing points so chart datasets can render gaps (null)
      row[key] = pt ? pt.y : undefined;
    }
    data.push(row);
  }
  return { data, categories, index: "t" as const };
}
