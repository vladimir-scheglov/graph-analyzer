import { useMemo } from "react";
import { useGraphStore } from "../state/useGraphStore";
import { matchesNamespace } from "../lib/namespace-filter";
import { mergeBidirectional } from "../lib/graph-transforms";
import { aggregateByNamespace } from "../lib/graph-transforms";
import { dagreLayout } from "../lib/layout";
import type { RFNode, RFEdge } from "../lib/types";
import { evaluateRules } from "../lib/rules";

export interface UseGraphFiltersResult {
  displayNodes: RFNode[];
  displayEdges: RFEdge[];
  filteredNodes: RFNode[];
  filteredEdges: RFEdge[];
  bidirectionalEdges: RFEdge[];
  counts: {
    domain: number;
    missing: number;
    broken: number;
    linkage: number;
    fqid: number;
  };
  isolatedCount: number;
  connected: Set<string>;
  filteredIdsHash: string;
}

/**
 * Возвращает отфильтрованные и трансформированные наборы узлов/рёбер.
 * Все данные берутся из store.
 */
export function useGraphFilters(): UseGraphFiltersResult {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const filters = useGraphStore((s) => s.filters);
  const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
  const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
  const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
  const bookmarks = useGraphStore((s) => s.bookmarks);
  const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
  const validationResults = useGraphStore((s) => s.validationResults);
  const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
  const tagFilters = useGraphStore((s) => s.tagFilters);
  const nsMode = useGraphStore((s) => s.nsMode);
  const bidirectional = useGraphStore((s) => s.bidirectional);
  const showViolationsOnly = useGraphStore((s) => s.showViolationsOnly);

  // Агрегация по неймспейсам — при включённом nsMode
  const display = useMemo(() => {
    if (!nsMode) return { nodes, edges };
    const agg = aggregateByNamespace(nodes, edges);
    return { nodes: dagreLayout(agg.nodes, agg.edges, "LR"), edges: agg.edges };
  }, [nodes, edges, nsMode]);

  const displayNodes = display.nodes;
  const displayEdges = display.edges;

  // Множество связанных узлов (для isolatedOnly)
  const connected = useMemo(() => {
    const s = new Set<string>();
    displayEdges.forEach((e) => {
      s.add(e.source);
      s.add(e.target);
    });
    return s;
  }, [displayEdges]);

  // Объединение A↔B
  const bidirectionalEdges = useMemo(() => {
    if (!bidirectional) return displayEdges;
    return mergeBidirectional(displayEdges);
  }, [displayEdges, bidirectional]);

  // Фильтрация узлов
  const filteredNodes = useMemo(() => {
    return displayNodes.filter((n) => {
      if (n.type === "clusterNode") return true;
      if (hiddenNodeIds.has(n.id)) return false;
      if (bookmarksOnly && !bookmarks.has(n.id)) return false;

      if (tagFilters.size > 0) {
        const nodeTags = (n.data.tags || []).map((t) =>
          String(t).toLowerCase(),
        );
        let matchesAny = false;
        tagFilters.forEach((tag) => {
          if (nodeTags.indexOf(tag.toLowerCase()) !== -1) matchesAny = true;
        });
        if (!matchesAny) return false;
      }

      if (onlyInvalid) {
        const v = validationResults
          ? validationResults.get(n.data.domainId)
          : null;
        if (!v || v.status !== "invalid") return false;
      }

      const t = n.data.nodeType;
      if (t === "domain" && !filters.domain) return false;
      if (t === "broken" && !filters.broken) return false;
      if (t === "missing" && !filters.missing) return false;
      if (
        namespaceFilter &&
        !matchesNamespace(n.data.domainId, namespaceFilter)
      )
        return false;
      if (isolatedOnly && (t !== "domain" || connected.has(n.id))) return false;

      return true;
    });
  }, [
    displayNodes,
    filters,
    namespaceFilter,
    isolatedOnly,
    connected,
    hiddenNodeIds,
    bookmarks,
    bookmarksOnly,
    onlyInvalid,
    validationResults,
    tagFilters,
  ]);

  // Правила (нужны для showViolationsOnly)
  const rules = useGraphStore((s) => s.rules);
  const ruleViolationsByEdge = useMemo(() => {
    const m = new Map<string, any[]>();
    if (!Array.isArray(rules) || rules.length === 0) return m;
    const violations = evaluateRules(displayEdges, displayNodes, rules);
    violations.forEach((v: any) => {
      if (!m.has(v.edgeId)) m.set(v.edgeId, []);
      m.get(v.edgeId)!.push(v);
    });
    return m;
  }, [displayEdges, displayNodes, rules]);

  const filteredEdges = useMemo(() => {
    const ids = new Set(filteredNodes.map((n) => n.id));
    return bidirectionalEdges.filter((e) => {
      if (!ids.has(e.source) || !ids.has(e.target)) return false;
      if (showViolationsOnly && !ruleViolationsByEdge.has(e.id)) return false;
      const kind = e.data && e.data.kind;
      if (kind === "linkage" && !filters.linkage) return false;
      if (kind === "fqid" && !filters.fqid) return false;
      return true;
    });
  }, [
    bidirectionalEdges,
    filteredNodes,
    filters.linkage,
    filters.fqid,
    showViolationsOnly,
    ruleViolationsByEdge,
  ]);

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

  const isolatedCount = useMemo(() => {
    const conn = new Set<string>();
    edges.forEach((e) => {
      conn.add(e.source);
      conn.add(e.target);
    });
    return nodes.filter((n) => n.data.nodeType === "domain" && !conn.has(n.id))
      .length;
  }, [nodes, edges]);

  const filteredIdsHash = useMemo(
    () =>
      filteredNodes
        .map((n) => n.id)
        .sort()
        .join(","),
    [filteredNodes],
  );

  return {
    displayNodes,
    displayEdges,
    filteredNodes,
    filteredEdges,
    bidirectionalEdges,
    counts,
    isolatedCount,
    connected,
    filteredIdsHash,
  };
}
