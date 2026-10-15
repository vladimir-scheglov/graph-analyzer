import dagre from "dagre";
import type { RFNode, RFEdge } from "./types";

// Размеры нод — экспортируются, чтобы использовать в App и компонентах
export const NODE_WIDTH = 300;
export const NODE_HEIGHT = 88;
export const NODE_COMPACT = 42;

interface ClusterBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  count: number;
}

type GetKeyForDepth = (node: RFNode, depth: number) => string;

export function dagreLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  rankdir: "LR" | "TB" = "LR",
): RFNode[] {
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir,
    nodesep: 18,
    ranksep: 60,
    edgesep: 10,
    marginx: 40,
    marginy: 40,
  });

  const validNodes = nodes.filter(
    (n) => n && typeof n.id === "string" && n.id.length > 0,
  );

  validNodes.forEach((n) => {
    const isCompact = n.data && n.data.__compact;
    g.setNode(n.id, {
      width: isCompact ? CW : W,
      height: isCompact ? CW : H,
    });
  });

  const validIds = new Set(validNodes.map((n) => n.id));
  edges.forEach((e) => {
    if (!e || !e.source || !e.target) return;
    if (!validIds.has(e.source) || !validIds.has(e.target)) return;
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return validNodes.map((n) => {
    const pos = g.node(n.id);
    const isCompact = n.data && n.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;

    const x =
      pos && typeof pos.x === "number" && isFinite(pos.x) ? pos.x - w / 2 : 0;
    const y =
      pos && typeof pos.y === "number" && isFinite(pos.y) ? pos.y - h / 2 : 0;

    return Object.assign({}, n, {
      position: { x, y },
      width: w,
      height: h,
      targetPosition: rankdir === "LR" ? "left" : "top",
      sourcePosition: rankdir === "LR" ? "right" : "bottom",
    }) as RFNode;
  });
}

export function circularLayout(nodes: RFNode[]): RFNode[] {
  const n = nodes.length;
  const R = Math.max(350, n * 40);
  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;

  return nodes.map((node, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const px = Math.cos(angle) * R;
    const py = Math.sin(angle) * R;
    const isCompact = node.data && node.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;

    return Object.assign({}, node, {
      position: {
        x: isFinite(px) ? px : i * 250,
        y: isFinite(py) ? py : 0,
      },
      width: w,
      height: h,
      targetPosition: "left",
      sourcePosition: "right",
    }) as RFNode;
  });
}

export function forceLayout(nodes: RFNode[], edges: RFEdge[]): RFNode[] {
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { x: Math.cos(a) * 400, y: Math.sin(a) * 400 };
  });

  const idx = new Map<string, number>();
  nodes.forEach((node, i) => idx.set(node.id, i));

  const links = edges
    .map(
      (e) =>
        [idx.get(e.source), idx.get(e.target)] as [
          number | undefined,
          number | undefined,
        ],
    )
    .filter((l): l is [number, number] => l[0] != null && l[1] != null);

  for (let iter = 0; iter < 250; iter++) {
    const fx = new Array(n).fill(0);
    const fy = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const d2 = dx * dx + dy * dy + 0.01;
        const d = Math.sqrt(d2);
        const f = 8000 / d2;
        fx[i] -= (dx / d) * f;
        fy[i] -= (dy / d) * f;
        fx[j] += (dx / d) * f;
        fy[j] += (dy / d) * f;
      }
    }

    for (const [a, b] of links) {
      const ddx = pos[b].x - pos[a].x;
      const ddy = pos[b].y - pos[a].y;
      const dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.01;
      const ff = (dd - 200) * 0.02;
      fx[a] += (ddx / dd) * ff;
      fy[a] += (ddy / dd) * ff;
      fx[b] -= (ddx / dd) * ff;
      fy[b] -= (ddy / dd) * ff;
    }

    const alpha = 1 - iter / 250;
    for (let m = 0; m < n; m++) {
      pos[m].x += fx[m] * alpha * 0.5;
      pos[m].y += fy[m] * alpha * 0.5;
    }
  }

  const W = NODE_WIDTH;
  const H = NODE_HEIGHT;
  const CW = NODE_COMPACT;

  return nodes.map((node, i) => {
    const isCompact = node.data && node.data.__compact;
    const w = isCompact ? CW : W;
    const h = isCompact ? CW : H;

    return Object.assign({}, node, {
      position: {
        x: isFinite(pos[i].x) ? pos[i].x : i * 250,
        y: isFinite(pos[i].y) ? pos[i].y : 0,
      },
      targetPosition: "left",
      sourcePosition: "right",
      width: w,
      height: h,
    }) as RFNode;
  });
}

export function clusterLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  getKeyForDepth: GetKeyForDepth,
): { nodes: RFNode[]; boxes: ClusterBox[]; effectiveDepth: number } {
  const NODE_W = NODE_WIDTH;
  const NODE_H = NODE_HEIGHT;
  const CLUSTER_PAD = 36;
  const HEADER_H = 30;
  const MAX_GROUPS = 50;

  let effectiveDepth = 2;
  for (let d = 1; d <= 5; d++) {
    const cnt = new Set<string>();
    nodes.forEach((n) => {
      if (n.data && n.data.nodeType === "domain") {
        const key = getKeyForDepth(n, d);
        if (key) cnt.add(key);
      }
    });
    effectiveDepth = d;
    if (cnt.size <= MAX_GROUPS) break;
  }

  const groups = new Map<string, RFNode[]>();
  const nodeToNs = new Map<string, string>();

  nodes.forEach((n) => {
    if (!n.data || n.data.nodeType !== "domain") {
      const key = "__other__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
      nodeToNs.set(n.id, key);
      return;
    }
    const ns = getKeyForDepth(n, effectiveDepth);
    if (!groups.has(ns)) groups.set(ns, []);
    groups.get(ns)!.push(n);
    nodeToNs.set(n.id, ns);
  });

  interface GroupLayout {
    nodes: Array<RFNode & { __x: number; __y: number }>;
    width: number;
    height: number;
    label: string | null;
  }
  const groupLayouts = new Map<string, GroupLayout>();

  groups.forEach((groupNodes, ns) => {
    if (ns === "__other__") {
      const laidOther = groupNodes.map(
        (n, i) =>
          Object.assign({}, n, { __x: i * (NODE_W + 20), __y: 0 }) as RFNode & {
            __x: number;
            __y: number;
          },
      );
      groupLayouts.set(ns, {
        nodes: laidOther,
        width: laidOther.length * (NODE_W + 20) - 20,
        height: NODE_H,
        label: null,
      });
      return;
    }

    if (groupNodes.length === 1) {
      groupLayouts.set(ns, {
        nodes: groupNodes.map(
          (n) =>
            Object.assign({}, n, { __x: 0, __y: 0 }) as RFNode & {
              __x: number;
              __y: number;
            },
        ),
        width: NODE_W,
        height: NODE_H,
        label: ns,
      });
      return;
    }

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: "LR",
      nodesep: 18,
      ranksep: 60,
      marginx: 10,
      marginy: 10,
    });

    const ids = new Set(groupNodes.map((n) => n.id));
    groupNodes.forEach((n) =>
      g.setNode(n.id, { width: NODE_W, height: NODE_H }),
    );
    edges.forEach((e) => {
      if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
    });

    dagre.layout(g);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const raw = groupNodes.map((n) => {
      const pos = g.node(n.id);
      const x = pos.x - NODE_W / 2;
      const y = pos.y - NODE_H / 2;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + NODE_W);
      maxY = Math.max(maxY, y + NODE_H);
      return { node: n, x, y };
    });

    const laid = raw.map(
      (item) =>
        Object.assign({}, item.node, {
          __x: item.x - minX,
          __y: item.y - minY,
        }) as RFNode & { __x: number; __y: number },
    );

    groupLayouts.set(ns, {
      nodes: laid,
      width: maxX - minX,
      height: maxY - minY,
      label: ns,
    });
  });

  // Мета-граф
  const metaEdgesMap = new Map<string, 1>();
  edges.forEach((e) => {
    const sNs = nodeToNs.get(e.source);
    const tNs = nodeToNs.get(e.target);
    if (!sNs || !tNs || sNs === tNs) return;
    metaEdgesMap.set(sNs + "→" + tNs, 1);
  });

  const meta = new dagre.graphlib.Graph();
  meta.setDefaultEdgeLabel(() => ({}));
  meta.setGraph({
    rankdir: "LR",
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  groupLayouts.forEach((layout, ns) => {
    const w = layout.width + (layout.label ? CLUSTER_PAD * 2 : 0);
    const h = layout.height + (layout.label ? CLUSTER_PAD * 2 + HEADER_H : 0);
    meta.setNode(ns, { width: w, height: h });
  });

  metaEdgesMap.forEach((_, key) => {
    const p = key.split("→");
    meta.setEdge(p[0], p[1]);
  });

  dagre.layout(meta);

  const finalNodes: RFNode[] = [];
  const boxes: ClusterBox[] = [];

  groupLayouts.forEach((layout, ns) => {
    const metaPos = meta.node(ns);
    const hasLabel = !!layout.label;
    const padX = hasLabel ? CLUSTER_PAD : 0;
    const padY = hasLabel ? CLUSTER_PAD + HEADER_H : 0;
    const groupW = layout.width + padX * 2;
    const groupH = layout.height + padY + (hasLabel ? CLUSTER_PAD : 0);
    const groupX = metaPos ? metaPos.x - groupW / 2 : 0;
    const groupY = metaPos ? metaPos.y - groupH / 2 : 0;

    if (hasLabel) {
      boxes.push({
        id: ns,
        label: ns,
        x: groupX,
        y: groupY,
        w: groupW,
        h: groupH,
        count: layout.nodes.length,
      });
    }

    layout.nodes.forEach((n) => {
      const copy = Object.assign({}, n) as any;
      delete copy.__x;
      delete copy.__y;
      finalNodes.push(
        Object.assign(copy, {
          position: {
            x: groupX + padX + n.__x,
            y: groupY + padY + n.__y,
          },
          width: NODE_W,
          height: NODE_H,
          targetPosition: "left",
          sourcePosition: "right",
        }) as RFNode,
      );
    });
  });

  return { nodes: finalNodes, boxes, effectiveDepth };
}

export type LayoutType =
  | "LR"
  | "TB"
  | "force"
  | "circular"
  | "cluster"
  | "folder";

export function getNsByDomainId(node: RFNode, depth: number): string {
  const parts = (node.data.domainId || "").split(".");
  return parts.slice(0, depth).join(".") || "__empty__";
}

export function getFolderKey(node: RFNode, depth: number): string {
  const fp = (node.data && node.data.folderPath) || [];
  if (fp.length === 0) return "__root__";
  return fp.slice(0, depth).join("/") || "__root__";
}

export function runLayout(
  nodes: RFNode[],
  edges: RFEdge[],
  type: LayoutType,
  opts?: { depth?: number },
): { nodes: RFNode[]; boxes: ClusterBox[]; effectiveDepth: number | null } {
  if (type === "TB") {
    return {
      nodes: dagreLayout(nodes, edges, "TB"),
      boxes: [],
      effectiveDepth: null,
    };
  }
  if (type === "force") {
    return {
      nodes: forceLayout(nodes, edges),
      boxes: [],
      effectiveDepth: null,
    };
  }
  if (type === "circular") {
    return { nodes: circularLayout(nodes), boxes: [], effectiveDepth: null };
  }
  if (type === "cluster") {
    const result = clusterLayout(nodes, edges, getNsByDomainId);
    return {
      nodes: result.nodes,
      boxes: result.boxes,
      effectiveDepth: result.effectiveDepth,
    };
  }
  if (type === "folder") {
    const result = clusterLayout(nodes, edges, getFolderKey);
    return {
      nodes: result.nodes,
      boxes: result.boxes,
      effectiveDepth: result.effectiveDepth,
    };
  }
  return {
    nodes: dagreLayout(nodes, edges, "LR"),
    boxes: [],
    effectiveDepth: null,
  };
}
