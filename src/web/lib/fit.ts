import type { RFNode } from "./types";

function getFocusTargetNodes(state: any): RFNode[] {
  const ch = state.cycleHighlight;
  if (ch) {
    const active = ch.cycles[ch.activeIndex];
    if (active && active.nodeIds.size > 0) {
      return state.nodes.filter((n: RFNode) => active.nodeIds.has(n.id));
    }
  }

  const path = state.pathResult;
  if (path && path.nodes.length > 0) {
    const ids = new Set(path.nodes);
    return state.nodes.filter((n: RFNode) => ids.has(n.id));
  }

  if (state.focusNode) {
    const ids = new Set<string>([state.focusNode]);
    state.edges.forEach((e: any) => {
      if (e.source === state.focusNode) ids.add(e.target);
      if (e.target === state.focusNode) ids.add(e.source);
    });
    return state.nodes.filter((n: RFNode) => ids.has(n.id));
  }

  return state.nodes;
}

let pendingFit = false;
export function fitActiveOrAll(): void {
  if (pendingFit) return;
  pendingFit = true;

  const state = (
    require("../state/useGraphStore") as any
  ).useGraphStore.getState();
  const rf = state.rfInstance;
  if (!rf) return;

  const nodes = getFocusTargetNodes(state);
  if (nodes.length === 0) {
    try {
      rf.fitView({ duration: 500, padding: 0.2 });
    } catch {
      /* ignore */
    }
    return;
  }

  // Даём React Flow завершить внутренние обновления (два rAF — безопасный минимум).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      pendingFit = false;
      try {
        rf.fitView({
          nodes: nodes.map((n: RFNode) => ({ id: n.id })),
          padding: 0.3,
          duration: 500,
        });
      } catch (e) {
        // Не даём ошибке d3-zoom уронить приложение
        console.warn("[fit] fitView failed:", e);
        try {
          rf.fitView({ duration: 500, padding: 0.2 });
        } catch {
          /* ignore */
        }
      }
    });
  });
}
