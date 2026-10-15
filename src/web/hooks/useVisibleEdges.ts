import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { RFEdge } from "../lib/types";
import type { Highlight } from "./useGraphHighlight";

const DIFF_ADDED = "#22c55e";
const DIFF_REMOVED = "#ef4444";
const LINKAGE_COLOR = "#6366a1";
const FQID_COLOR = "#4b7c6c";

/**
 * Применяет к рёбрам все визуальные состояния:
 * - жёсткая фильтрация при path/cycle/focus (только рёбра подсветки)
 * - цвет/толщина/animated для highlight, diff, rules, selected
 */
export function useVisibleEdges(
  edgesForRender: RFEdge[],
  highlight: Highlight | null,
  violationsByEdge: Map<string, any[]>,
): RFEdge[] {
  const diffMode = useGraphStore((s) => s.diffMode);
  const rulesHighlighted = useGraphStore((s) => s.rulesHighlighted);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);

  return useMemo(() => {
    const isStrictHighlight =
      highlight &&
      (highlight.type === "path" ||
        highlight.type === "cycle" ||
        highlight.type === "focus");

    let baseEdges = edgesForRender;
    if (isStrictHighlight) {
      baseEdges = edgesForRender.filter((e) => {
        const eid = (e.data && e.data.originalId) || e.id;
        return highlight!.edges.has(e.id) || highlight!.edges.has(eid);
      });
    }

    const hasHighlight =
      highlight ||
      diffMode ||
      selectedEdgeId ||
      (rulesHighlighted && violationsByEdge.size > 0);

    if (!hasHighlight) return baseEdges;

    return baseEdges.map((e) => {
      const isSelected = e.id === selectedEdgeId;
      const hl =
        highlight &&
        (highlight.edges.has(e.id) ||
          (e.data &&
            e.data.originalId &&
            highlight.edges.has(e.data.originalId)));

      const baseColor =
        e.data && e.data.kind === "linkage"
          ? LINKAGE_COLOR
          : e.data && e.data.kind === "fqid"
            ? FQID_COLOR
            : LINKAGE_COLOR;

      let stroke = baseColor;
      let opacity = 0.5;
      let strokeWidth = (e.style && e.style.strokeWidth) || 1.0;
      let animated = false;

      if (highlight) {
        if (highlight.soft) {
          if (hl) {
            opacity = 0.9;
            strokeWidth = e.data && e.data.kind === "linkage" ? 2.2 : 1.8;
          }
        } else {
          opacity = hl ? 1 : 0.06;
          strokeWidth = hl
            ? e.data && e.data.kind === "linkage"
              ? 3
              : 2
            : strokeWidth;
          animated = !!hl && highlight.type === "path";
        }
      }

      if (diffMode) {
        if (diffMode.addedEdges.has(e.id)) {
          stroke = DIFF_ADDED;
          opacity = 1;
          strokeWidth = 3;
          animated = true;
        } else if (diffMode.removedEdges.has(e.id)) {
          stroke = DIFF_REMOVED;
          opacity = 1;
          strokeWidth = 3;
        }
      }

      if (rulesHighlighted && violationsByEdge.has(e.id)) {
        const v = violationsByEdge.get(e.id)!;
        const hasForbid = v.some((x) => x.severity === "forbid");
        stroke = hasForbid ? "#dc2626" : "#f59e0b";
        opacity = 1;
        strokeWidth = 3.5;
        animated = true;
      }

      if (isSelected) {
        stroke = "#fbbf24";
        opacity = 1;
        strokeWidth = 4;
        animated = true;
      }

      return {
        ...e,
        animated,
        style: { ...e.style, stroke, opacity, strokeWidth },
        markerEnd: { ...e.markerEnd, color: stroke },
        markerStart: e.markerStart
          ? { ...e.markerStart, color: stroke }
          : undefined,
      };
    });
  }, [
    edgesForRender,
    highlight,
    diffMode,
    rulesHighlighted,
    violationsByEdge,
    selectedEdgeId,
  ]);
}
