import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { findReachable } from "../lib/algorithms/reachable";
import type { RFEdge } from "../lib/types";

export const PATH_COLOR = "#fbbf24";
export const CYCLE_COLOR = "#f97316";
export const FOCUS_COLOR = "#22d3ee";
export const SELECTED_COLOR = "#818cf8";

export interface Highlight {
  nodes: Set<string>;
  edges: Set<string>;
  color: string;
  type: "path" | "cycle" | "focus" | "selected";
  soft?: boolean;
}

/**
 * Определяет текущую активную подсветку. Приоритет:
 * path > cycle > focus > selected
 */
export function useGraphHighlight(
  filteredEdges: RFEdge[],
  edgesForFocus: RFEdge[],
): Highlight | null {
  const pathResult = useGraphStore((s) => s.pathResult);
  const cycleHighlight = useGraphStore((s) => s.cycleHighlight);
  const focusNode = useGraphStore((s) => s.focusNode);
  const focusDepth = useGraphStore((s) => s.focusDepth);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  return useMemo(() => {
    if (pathResult) {
      return {
        nodes: new Set(pathResult.nodes),
        edges: new Set(pathResult.edges),
        color: PATH_COLOR,
        type: "path" as const,
      };
    }

    if (cycleHighlight) {
      return {
        nodes: cycleHighlight.nodeIds,
        edges: cycleHighlight.edgeIds,
        color: CYCLE_COLOR,
        type: "cycle" as const,
      };
    }

    if (focusNode) {
      const reachable = findReachable(focusNode, focusDepth, edgesForFocus);
      const focusEdges = new Set<string>();
      edgesForFocus.forEach((e) => {
        if (reachable.has(e.source) && reachable.has(e.target))
          focusEdges.add(e.id);
      });
      return {
        nodes: reachable,
        edges: focusEdges,
        color: FOCUS_COLOR,
        type: "focus" as const,
      };
    }

    if (selectedNodeId) {
      const nodeIds = new Set<string>([selectedNodeId]);
      const edgeIds = new Set<string>();
      filteredEdges.forEach((e) => {
        if (e.source === selectedNodeId || e.target === selectedNodeId) {
          edgeIds.add(e.id);
          nodeIds.add(e.source);
          nodeIds.add(e.target);
        }
      });
      return {
        nodes: nodeIds,
        edges: edgeIds,
        color: SELECTED_COLOR,
        type: "selected" as const,
        soft: true,
      };
    }

    return null;
  }, [
    focusNode,
    selectedNodeId,
    focusDepth,
    cycleHighlight,
    pathResult,
    filteredEdges,
    edgesForFocus,
  ]);
}
