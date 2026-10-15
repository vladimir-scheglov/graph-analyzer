import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { HEATMAPS, HeatmapScheme } from "../lib/heatmap";
import type { RFNode, RFEdge } from "../lib/types";

export interface HeatmapValues {
  map: Map<string, number>;
  min: number;
  max: number;
  scheme: HeatmapScheme;
}

/**
 * Считает значения heatmap по текущей метрике (health/degree/entities/fqid).
 * Возвращает null, если heatmap выключен.
 */
export function useHeatmapValues(
  displayNodes: RFNode[],
  displayEdges: RFEdge[],
  healthMap: Map<string, any>,
): HeatmapValues | null {
  const heatmap = useGraphStore((s) => s.heatmap);

  return useMemo(() => {
    if (heatmap === "none") return null;

    const map = new Map<string, number>();
    const values: number[] = [];

    displayNodes.forEach((n) => {
      let v = 0;
      if (heatmap === "health") {
        const h = healthMap.get(n.id);
        v =
          h && typeof h === "object"
            ? h.score || 0
            : typeof h === "number"
              ? h
              : 0;
      } else if (heatmap === "degree") {
        let d = 0;
        displayEdges.forEach((e) => {
          if (e.source === n.id) d++;
          if (e.target === n.id) d++;
        });
        v = d;
      } else if (heatmap === "entities") {
        v = n.data.entitiesCount || 0;
      } else if (heatmap === "fqid") {
        v = (n.data.fqidRefs || []).length;
      }
      map.set(n.id, v);
      values.push(v);
    });

    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    return { map, min, max, scheme: HEATMAPS[heatmap] };
  }, [heatmap, displayNodes, displayEdges, healthMap]);
}
