import { useCallback, useEffect, useRef } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { runLayout, LayoutType } from "../lib/layout";
import type { RFNode, RFEdge } from "../lib/types";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 88;
const NODE_W_NORMAL = 300;
const NODE_H_NORMAL = 88;
const NODE_W_COMPACT = 42;
const NODE_H_COMPACT = 42;

export interface UseGraphLayoutParams {
  filteredNodes: RFNode[];
  filteredEdges: RFEdge[];
  filteredIdsHash: string;
}

export interface UseGraphLayoutResult {
  /** Форсированная переукладка (для кнопки «Переуложить»). */
  relayout: () => void;
  /** Сбросить кэш layout — нужен при reset-all или смене режима. */
  invalidate: () => void;
}

/**
 * Автоматически перекладывает граф при изменении:
 * - filteredIdsHash (состав видимых узлов)
 * - layoutType
 * - clusterDepth
 * - compact
 *
 * Плюс предоставляет ручной relayout и invalidate.
 */
export function useGraphLayout({
  filteredNodes,
  filteredEdges,
  filteredIdsHash,
}: UseGraphLayoutParams): UseGraphLayoutResult {
  const layoutType = useGraphStore((s) => s.layoutType);
  const clusterDepth = useGraphStore((s) => s.clusterDepth);
  const compact = useGraphStore((s) => s.compact);
  const setNodes = useGraphStore((s) => s.setNodes);
  const setClusterBoxes = useGraphStore((s) => s.setClusterBoxes);
  const setClusterGroupCount = useGraphStore((s) => s.setClusterGroupCount);
  const rfInstance = useGraphStore((s) => s.rfInstance);

  const appliedRef = useRef<string | null>(null);
  const nodesRef = useRef<RFNode[]>([]);
  const edgesRef = useRef<RFEdge[]>([]);
  const nsMode = useGraphStore((s) => s.nsMode);

  // Актуальные ссылки для useCallback без deps
  nodesRef.current = useGraphStore.getState().nodes;
  edgesRef.current = filteredEdges;

  const applyLayout = useCallback(
    (type: LayoutType, depth: number) => {
      const layoutInput = filteredNodes.map((n) => ({
        ...n,
        data: { ...n.data, __compact: compact },
      }));

      if (layoutInput.length === 0) return;

      const result = runLayout(layoutInput, filteredEdges, type, { depth });
      const posMap = new Map<string, { x: number; y: number }>();
      result.nodes.forEach((n) => posMap.set(n.id, n.position));

      setClusterBoxes(
        type === "cluster" || type === "folder" ? result.boxes : [],
      );
      setClusterGroupCount(result.boxes.length);

      const visibleIds = new Set(filteredNodes.map((n) => n.id));

      setNodes((prev) =>
        prev.map((n) => {
          const visible = visibleIds.has(n.id);
          const newPos = posMap.get(n.id);
          const w = compact ? NODE_W_COMPACT : NODE_W_NORMAL;
          const h = compact ? NODE_H_COMPACT : NODE_H_NORMAL;
          if (visible && newPos) {
            return {
              ...n,
              position: newPos,
              hidden: false,
              width: w,
              height: h,
            };
          }
          return { ...n, hidden: !visible };
        }),
      );
    },
    [
      filteredNodes,
      filteredEdges,
      compact,
      setNodes,
      setClusterBoxes,
      setClusterGroupCount,
    ],
  );

  // Автоматический layout на изменение условий
  useEffect(() => {
    if (!filteredIdsHash) return;

    // При nsMode раскладку делает useGraphFilters: ns-узлы в store.nodes
    // отсутствуют, и applyLayout/setNodes их не увидят.
    // Заодно снимаем рамки — при агрегации они не имеют смысла
    // (ns-узел = уже схлопнутая группа).
    if (nsMode) {
      setClusterBoxes([]);
      setClusterGroupCount(0);
      appliedRef.current = null;
      return;
    }

    const key = `${layoutType}:${clusterDepth}:${compact}:${filteredIdsHash}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;

    applyLayout(layoutType, clusterDepth);

    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (rfInstance) {
            try {
              rfInstance.fitView({ duration: 400, padding: 0.15 });
            } catch {}
          }
        });
      });
    }, 80);
  }, [
    filteredIdsHash,
    layoutType,
    clusterDepth,
    compact,
    applyLayout,
    rfInstance,
    nsMode,
    setClusterBoxes,
    setClusterGroupCount,
  ]);

  useEffect(() => {
    const w = compact ? NODE_W_COMPACT : NODE_W_NORMAL;
    const h = compact ? NODE_H_COMPACT : NODE_H_NORMAL;

    setNodes((prev) =>
      prev.map((n) =>
        n.width === w && n.height === h ? n : { ...n, width: w, height: h },
      ),
    );
  }, [compact, setNodes]);

  const relayout = useCallback(() => {
    appliedRef.current = null;

    if (nsMode) {
      // ns-узлы не в store.nodes — пересчитываем layout в useGraphFilters
      // через новый массив (useMemo по ссылке nodes).
      setNodes((prev) => [...prev]);
      return;
    }

    applyLayout(layoutType, clusterDepth);
    setTimeout(() => {
      if (rfInstance) {
        try {
          rfInstance.fitView({ duration: 500 });
        } catch {}
      }
    }, 100);
  }, [applyLayout, layoutType, clusterDepth, rfInstance, nsMode, setNodes]);

  const invalidate = useCallback(() => {
    appliedRef.current = null;
  }, []);

  return { relayout, invalidate };
}
