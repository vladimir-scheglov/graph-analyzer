import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import type { RFNode } from "../lib/types";

export interface ConnectedItem {
  node: RFNode;
  degree: number;
}
export interface WorstHealthItem {
  node: RFNode;
  health: number;
}
export interface MissingRefItem {
  node: RFNode;
  count: number;
  uniqueTargets: string[];
}

export interface SidebarStats {
  topConnected: ConnectedItem[];
  worstHealth: WorstHealthItem[];
  namespaces: Array<[string, number]>;
  tagCloud: Array<[string, number]>;
  isolatedCount: number;
  topMissingRefs: MissingRefItem[];
  counts: {
    domain: number;
    missing: number;
    broken: number;
    linkage: number;
    fqid: number;
  };
}

export function useSidebarStats(healthMap: Map<string, any>): SidebarStats {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);

  const topConnected = useMemo<ConnectedItem[]>(() => {
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      if (deg.has(e.source)) deg.set(e.source, deg.get(e.source)! + 1);
      if (deg.has(e.target)) deg.set(e.target, deg.get(e.target)! + 1);
    });
    return nodes
      .map((n) => ({ node: n, degree: deg.get(n.id) || 0 }))
      .filter((x) => x.degree > 0)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5);
  }, [nodes, edges]);

  const worstHealth = useMemo<WorstHealthItem[]>(() => {
    return nodes
      .filter((n) => n.data.nodeType === "domain")
      .map((n) => {
        const h = healthMap.get(n.id);
        const score =
          h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
        return { node: n, health: score };
      })
      .sort((a, b) => a.health - b.health)
      .slice(0, 5);
  }, [nodes, healthMap]);

  const namespaces = useMemo<Array<[string, number]>>(() => {
    const map = new Map<string, number>();
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain") return;
      const ns = n.data.domainId.split(".").slice(0, 2).join(".");
      map.set(ns, (map.get(ns) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const tagCloud = useMemo<Array<[string, number]>>(() => {
    const m = new Map<string, number>();
    nodes.forEach((n) => {
      (n.data.tags || []).forEach((t) =>
        m.set(String(t), (m.get(String(t)) || 0) + 1),
      );
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);
  }, [nodes]);

  const isolatedCount = useMemo(() => {
    const conn = new Set<string>();
    edges.forEach((e) => {
      conn.add(e.source);
      conn.add(e.target);
    });
    return nodes.filter((n) => n.data.nodeType === "domain" && !conn.has(n.id))
      .length;
  }, [nodes, edges]);

  const topMissingRefs = useMemo<MissingRefItem[]>(() => {
    const result: MissingRefItem[] = [];
    const domainIds = new Set<string>();
    nodes.forEach((n) => {
      if (n.data.nodeType === "domain")
        domainIds.add(n.data.domainId.toLowerCase());
    });
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain") return;
      const refs = n.data.fqidRefs || [];
      const missing = refs.filter(
        (r: any) => !domainIds.has((r.targetDomainId || "").toLowerCase()),
      );
      if (missing.length === 0) return;
      const targets = new Set<string>();
      missing.forEach((r: any) => targets.add(r.targetDomainId));
      result.push({
        node: n,
        count: missing.length,
        uniqueTargets: Array.from(targets),
      });
    });
    return result.sort((a, b) => b.count - a.count).slice(0, 10);
  }, [nodes]);

  const counts = useMemo(
    () => ({
      domain: nodes.filter((n) => n.data.nodeType === "domain").length,
      missing: nodes.filter((n) => n.data.nodeType === "missing").length,
      broken: nodes.filter((n) => n.data.nodeType === "broken").length,
      linkage: edges.filter((e) => e.data && e.data.kind === "linkage").length,
      fqid: edges.filter((e) => e.data && e.data.kind === "fqid").length,
    }),
    [nodes, edges],
  );

  return {
    topConnected,
    worstHealth,
    namespaces,
    tagCloud,
    isolatedCount,
    topMissingRefs,
    counts,
  };
}
