import { useEffect } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { findCycles } from "../lib/algorithms/cycles";
import { EVT_FIND_CYCLES, EVT_OPEN_FILE } from "../lib/events";
import type { RFNode, RFEdge } from "../lib/types";

export interface UseGraphEventsParams {
  displayNodes: RFNode[];
  displayEdges: RFEdge[];
}

/**
 * Подписка на CustomEvent от дочерних компонентов:
 * - dg:find-cycles  → найти и подсветить циклы
 * - dg:open-file    → открыть файл в Monaco
 * - dg:goto         → перейти к домену (используется в Sidebar)
 */
export function useGraphEvents({
  displayNodes,
  displayEdges,
}: UseGraphEventsParams): void {
  const setCycleHighlight = useGraphStore((s) => s.setCycleHighlight);
  const cycleHighlight = useGraphStore((s) => s.cycleHighlight);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);
  const setFocusNode = useGraphStore((s) => s.setFocusNode);
  const setPathResult = useGraphStore((s) => s.setPathResult);
  const setPathSel = useGraphStore((s) => s.setPathSel);
  const rfInstance = useGraphStore((s) => s.rfInstance);

  useEffect(() => {
    const onFindCycles = () => {
      if (cycleHighlight) {
        setCycleHighlight(null);
        return;
      }
      const info = findCycles(displayNodes, displayEdges);
      if (info.cycleNodes.size === 0) {
        alert("Циклы не найдены");
        return;
      }
      setCycleHighlight({
        nodeIds: info.cycleNodes,
        edgeIds: info.cycleEdges,
        sccCount: info.sccs.length,
      });
      setSelectedNodeId(null);
      setFocusNode(null);
      setPathResult(null);
      setPathSel([]);
      setTimeout(() => {
        if (rfInstance) {
          try {
            rfInstance.fitView({ duration: 500, padding: 0.25 });
          } catch {}
        }
      }, 50);
    };

    document.addEventListener(EVT_FIND_CYCLES, onFindCycles);
    return () => {
      document.removeEventListener(EVT_FIND_CYCLES, onFindCycles);
    };
  }, [
    displayNodes,
    displayEdges,
    cycleHighlight,
    setCycleHighlight,
    setSelectedNodeId,
    setFocusNode,
    setPathResult,
    setPathSel,
    rfInstance,
  ]);
}
