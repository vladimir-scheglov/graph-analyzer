import type {
  RFNode,
  RFEdge,
  HealthResult,
  HealthBreakdownItem,
} from "./types";

export function computeHealth(
  node: RFNode,
  edges: RFEdge[],
  allNodes: RFNode[],
  cycleNodes: Set<string> | null,
  missingSet: Set<string> | null,
): HealthResult {
  if (node.data.nodeType === "broken" || node.data.nodeType === "missing") {
    return {
      score: 0,
      breakdown: [{ reason: "Узел битый или отсутствует", delta: -100 }],
    };
  }

  const breakdown: HealthBreakdownItem[] = [];
  let score = 100;

  let connected = false;
  let inEdges = 0;
  let outEdges = 0;
  edges.forEach((e) => {
    if (e.source === node.id) {
      connected = true;
      outEdges++;
    }
    if (e.target === node.id) {
      connected = true;
      inEdges++;
    }
  });

  if (!connected) {
    score -= 40;
    breakdown.push({ reason: "Домен изолирован (нет связей)", delta: -40 });
  }

  if (cycleNodes && cycleNodes.has(node.id)) {
    score -= 30;
    breakdown.push({ reason: "Участвует в цикле", delta: -30 });
  }

  const refs = node.data.fqidRefs || [];
  let missingRefs = 0;
  refs.forEach((r) => {
    const exists = allNodes.some(
      (n) =>
        (n.data.domainId || "").toLowerCase() ===
        (r.targetDomainId || "").toLowerCase(),
    );
    if (!exists) missingRefs++;
  });

  if (missingRefs > 0) {
    const delta = -Math.min(missingRefs * 3, 20);
    score -= Math.abs(delta);
    breakdown.push({ reason: "Битых FQID-ссылок: " + missingRefs, delta });
  }

  return { score: Math.max(0, Math.round(score)), breakdown };
}

export function healthClass(
  score: number,
): "health-good" | "health-mid" | "health-bad" {
  if (score >= 80) return "health-good";
  if (score >= 50) return "health-mid";
  return "health-bad";
}
