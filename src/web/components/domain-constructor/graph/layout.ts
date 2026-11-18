import dagre from "dagre";
import type { BuiltNode, BuiltEdge } from "./graph-builder";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 64;

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

/**
 * Dagre-разметка графа.
 *
 * - direction: 'LR' (по умолчанию) — хорошо для связей между сущностями.
 * - rankdir: LR / TB / RL / BT.
 */
export function layoutGraph(
  nodes: BuiltNode[],
  edges: BuiltEdge[],
  direction: "LR" | "TB" | "RL" | "BT" = "LR",
): LayoutResult {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 100,
    edgesep: 30,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    // multigraph: разные kind = разные рёбра между теми же узлами
    g.setEdge(e.source, e.target, {}, `${e.kind}-${e.id}`);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const node = g.node(n.id);
    positions[n.id] = {
      x: node.x - NODE_WIDTH / 2,
      y: node.y - NODE_HEIGHT / 2,
    };
  }
  return { positions };
}
