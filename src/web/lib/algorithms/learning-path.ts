import type {
  RFNode,
  RFEdge,
  LearningPath,
  LearningPathDomain,
} from "../types";

export function computeLearningPath(
  nodes: RFNode[],
  edges: RFEdge[],
): LearningPath {
  const nodeById = new Map<string, RFNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  const domainNodes = nodes.filter((n) => n.data.nodeType === "domain");
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  domainNodes.forEach((n) => {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  });

  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source)! + 1);
    if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target)! + 1);
  });

  const entryPoints = domainNodes.filter((n) => {
    const fi = fanIn.get(n.id) || 0;
    const fo = fanOut.get(n.id) || 0;
    return fi === 0 && fo > 0;
  });

  const deps = new Map<string, Set<string>>();
  domainNodes.forEach((n) => deps.set(n.id, new Set()));
  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    const src = nodeById.get(e.source)!;
    const tgt = nodeById.get(e.target)!;
    if (src.data.nodeType !== "domain" || tgt.data.nodeType !== "domain")
      return;
    if (src.id === tgt.id) return;
    deps.get(src.id)!.add(tgt.id);
  });

  const remaining = new Set(domainNodes.map((n) => n.id));
  const stages: string[][] = [];

  while (remaining.size > 0) {
    const stage: string[] = [];
    remaining.forEach((id) => {
      let ready = true;
      deps.get(id)!.forEach((dep) => {
        if (remaining.has(dep)) ready = false;
      });
      if (ready) stage.push(id);
    });
    if (stage.length === 0) break;
    stage.forEach((id) => remaining.delete(id));
    stage.sort((a, b) => (fanIn.get(b) || 0) - (fanIn.get(a) || 0));
    stages.push(stage);
  }

  const unresolved = Array.from(remaining);

  function enrich(id: string): LearningPathDomain | null {
    const n = nodeById.get(id);
    if (!n) return null;
    return {
      id,
      domainId: n.data.domainId,
      label: n.data.label,
      description: n.data.description,
      tags: n.data.tags || [],
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOut.get(id) || 0,
      entitiesCount: n.data.entitiesCount,
      fqidRefsCount: (n.data.fqidRefs || []).length,
    };
  }

  const enrichedStages = stages.map((stage, idx) => ({
    index: idx,
    domains: stage
      .map(enrich)
      .filter((x): x is LearningPathDomain => x !== null),
  }));

  return {
    entryPoints: entryPoints
      .map((n) => enrich(n.id))
      .filter((x): x is LearningPathDomain => x !== null),
    stages: enrichedStages,
    totalStages: stages.length,
    totalDomains: domainNodes.length,
    unresolved: unresolved
      .map(enrich)
      .filter((x): x is LearningPathDomain => x !== null),
  };
}
