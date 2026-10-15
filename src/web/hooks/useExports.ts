import { useCallback } from "react";
import { useGraphStore } from "../state/useGraphStore";
import {
  exportGraphJSON,
  exportMermaid,
  exportPNG,
  exportStatsMarkdown,
} from "../lib/export";
import { generateMarkdownReport } from "../lib/markdown";
import type { RFNode, RFEdge } from "../lib/types";

export interface UseExportsParams {
  visibleNodes: RFNode[];
  visibleEdges: RFEdge[];
  counts: {
    domain: number;
    missing: number;
    broken: number;
    linkage: number;
    fqid: number;
  };
  isolatedCount: number;
  cyclesCount: number;
  healthMap: Map<string, any>;
  cyclesInfo: any;
}

export interface UseExportsResult {
  exportJSON: () => void;
  exportMarkdown: () => void;
  exportPNGFile: () => void;
  exportMermaidFile: () => void;
  exportStats: () => void;
}

/**
 * Все экспортёры: JSON, Markdown-отчёт, PNG, Mermaid, статистика сайдбара.
 * Считает sidebar-статистику «на лету» — она нужна только при экспорте статистики.
 */
export function useExports({
  visibleNodes,
  visibleEdges,
  counts,
  isolatedCount,
  cyclesCount,
  healthMap,
  cyclesInfo,
}: UseExportsParams): UseExportsResult {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
  const filters = useGraphStore((s) => s.filters);

  const exportJSON = useCallback(() => {
    exportGraphJSON(nodes, edges);
  }, [nodes, edges]);

  const exportMarkdown = useCallback(() => {
    const md = generateMarkdownReport({
      nodes,
      edges,
      cyclesInfo,
      healthMap,
      namespaceFilter,
      filters: filters as unknown as Record<string, boolean>,
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "domain-report-" +
      new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-") +
      ".md";
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, cyclesInfo, healthMap, namespaceFilter, filters]);

  const exportPNGFile = useCallback(() => {
    exportPNG();
  }, []);

  const exportMermaidFile = useCallback(() => {
    exportMermaid(visibleNodes, visibleEdges);
  }, [visibleNodes, visibleEdges]);

  const exportStats = useCallback(() => {
    // Считаем статистику для сайдбара на лету — используется только здесь
    const deg = new Map<string, number>();
    nodes.forEach((n) => deg.set(n.id, 0));
    edges.forEach((e) => {
      if (deg.has(e.source)) deg.set(e.source, deg.get(e.source)! + 1);
      if (deg.has(e.target)) deg.set(e.target, deg.get(e.target)! + 1);
    });
    const topConnected = nodes
      .map((n) => ({ node: n, degree: deg.get(n.id) || 0 }))
      .filter((x) => x.degree > 0)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5);

    const worstHealth = nodes
      .filter((n) => n.data.nodeType === "domain")
      .map((n) => {
        const h = healthMap.get(n.id);
        const score =
          h && typeof h === "object" ? h.score : typeof h === "number" ? h : 0;
        return { node: n, health: score };
      })
      .sort((a, b) => a.health - b.health)
      .slice(0, 5);

    const nsMap = new Map<string, number>();
    nodes.forEach((n) => {
      if (n.data.nodeType !== "domain") return;
      const ns = n.data.domainId.split(".").slice(0, 2).join(".");
      nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
    });
    const namespaces = Array.from(nsMap.entries()).sort((a, b) => b[1] - a[1]);

    const tagMap = new Map<string, number>();
    nodes.forEach((n) => {
      (n.data.tags || []).forEach((t) =>
        tagMap.set(String(t), (tagMap.get(String(t)) || 0) + 1),
      );
    });
    const tagCloud = Array.from(tagMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);

    exportStatsMarkdown(
      nodes,
      edges,
      counts,
      isolatedCount,
      cyclesCount,
      topConnected,
      worstHealth,
      namespaces,
      tagCloud,
    );
  }, [nodes, edges, counts, isolatedCount, cyclesCount, healthMap]);

  return {
    exportJSON,
    exportMarkdown,
    exportPNGFile,
    exportMermaidFile,
    exportStats,
  };
}
