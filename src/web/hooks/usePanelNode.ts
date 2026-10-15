import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { RFNode, RFEdge } from "../lib/types";

export interface UsePanelNodeResult {
  panelNode: RFNode | null;
  panelEdge: RFEdge | null;
}

/**
 * Извлекает текущий узел/ребро для SidePanel.
 * Ищет в visible (если есть) и в полном списке (fallback).
 */
export function usePanelNode(
  visibleNodes: RFNode[],
  visibleEdges: RFEdge[],
  displayEdges: RFEdge[],
): UsePanelNodeResult {
  const panelNodeId = useGraphStore((s) => s.panelNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const allNodes = useGraphStore((s) => s.nodes);
  const allEdges = useGraphStore((s) => s.edges);

  const panelNode = useMemo(() => {
    if (!panelNodeId) return null;
    return (
      visibleNodes.find((n) => n.id === panelNodeId) ||
      allNodes.find((n) => n.id === panelNodeId) ||
      null
    );
  }, [panelNodeId, visibleNodes, allNodes]);

  const panelEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return (
      displayEdges.find((e) => e.id === selectedEdgeId) ||
      visibleEdges.find((e) => e.id === selectedEdgeId) ||
      allEdges.find((e) => e.id === selectedEdgeId) ||
      null
    );
  }, [selectedEdgeId, displayEdges, visibleEdges, allEdges]);

  return { panelNode, panelEdge };
}
