import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { heatColor } from "../lib/heatmap";
import type { RFNode } from "../lib/types";
import type { HeatmapValues } from "./useHeatmapValues";
import type { Highlight } from "./useGraphHighlight";

/**
 * Применяет к filteredNodes всё, что зависит от активных режимов:
 * подсветка (dimmed / inPath), diff, topo, validation, heatmap, bookmarks.
 *
 * Быстрый путь: когда ничего неактивно, возвращает узлы с минимумом добавленных полей.
 */
export function useVisibleNodes(
  filteredNodes: RFNode[],
  highlight: Highlight | null,
  healthMap: Map<string, any>,
  heatmapValues: HeatmapValues | null,
): RFNode[] {
  const compact = useGraphStore((s) => s.compact);
  const pathResult = useGraphStore((s) => s.pathResult);
  const diffMode = useGraphStore((s) => s.diffMode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const topoLevelMap = useGraphStore((s) => s.topoLevelMap);
  const validationResults = useGraphStore((s) => s.validationResults);
  const bookmarks = useGraphStore((s) => s.bookmarks);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);

  return useMemo(() => {
    const pathEndpoints = pathResult
      ? new Set([
          pathResult.nodes[0],
          pathResult.nodes[pathResult.nodes.length - 1],
        ])
      : null;

    const hasHighlight = !!(
      highlight ||
      diffMode ||
      topoLevelMap ||
      validationResults ||
      heatmapValues
    );

    return filteredNodes.map((n) => {
      const h = healthMap.get(n.id);
      const healthScore =
        h && typeof h === "object" ? h.score : typeof h === "number" ? h : null;
      const healthBreakdown =
        h && typeof h === "object" ? h.breakdown || [] : [];

      const topoLvl = topoLevelMap ? topoLevelMap.get(n.data.domainId) : null;
      const validation = validationResults
        ? validationResults.get(n.data.domainId)
        : null;
      const isInvalid = validation && validation.status === "invalid";
      const isBookmarked = bookmarks.has(n.id);

      let heatColorValue: string | undefined;
      if (heatmapValues) {
        const v = heatmapValues.map.get(n.id) || 0;
        heatColorValue = heatColor(
          v,
          heatmapValues.min,
          heatmapValues.max,
          heatmapValues.scheme,
        );
      }

      const baseData = {
        ...n.data,
        health: healthScore,
        healthBreakdown,
        __compact: compact,
        __topoLevel: topoLvl,
        __invalid: isInvalid,
        __validationStatus: validation ? validation.status : null,
        __validationDiagnostics:
          validation && validation.diagnostics ? validation.diagnostics : [],
        __validationCount:
          validation && validation.diagnostics
            ? validation.diagnostics.length
            : 0,
        __bookmarked: isBookmarked,
        __tooltipsEnabled: tooltipsEnabled,
        __heatColor: heatColorValue,
      };

      // Быстрый путь — нет активных режимов и выделения
      if (!hasHighlight && !selectedNodeId && hiddenNodeIds.size === 0) {
        return { ...n, data: baseData, selected: false };
      }

      const dimmed =
        highlight && !highlight.soft ? !highlight.nodes.has(n.id) : false;
      const inPath = !!(
        highlight &&
        highlight.type === "path" &&
        highlight.nodes.has(n.id)
      );
      const isPathEndpoint = !!(pathEndpoints && pathEndpoints.has(n.id));
      const isAdded = !!(diffMode && diffMode.addedNodes.has(n.id));

      return {
        ...n,
        style: { opacity: dimmed ? 0.12 : 1, transition: "opacity 0.2s" },
        data: {
          ...baseData,
          dimmed,
          __inPath: inPath,
          __isPathEndpoint: isPathEndpoint,
          __isAdded: isAdded,
          __selectedHighlight: !!(
            highlight &&
            highlight.soft &&
            highlight.nodes.has(n.id) &&
            n.id === selectedNodeId
          ),
        },
        selected: n.id === selectedNodeId,
      };
    });
  }, [
    filteredNodes,
    highlight,
    compact,
    pathResult,
    diffMode,
    healthMap,
    selectedNodeId,
    topoLevelMap,
    validationResults,
    bookmarks,
    hiddenNodeIds,
    heatmapValues,
    tooltipsEnabled,
  ]);
}
