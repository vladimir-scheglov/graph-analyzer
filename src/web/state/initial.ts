import type { RFNode, RFEdge } from "../lib/types";
import { dagreLayout } from "../lib/layout";

const LINKAGE_COLOR = "#6366a1";
const FQID_COLOR = "#4b7c6c";

interface GraphData {
  nodes: Array<{
    id: string;
    domainId?: string;
    label?: string;
    group: "domain" | "missing" | "broken";
    filePath?: string | null;
    folderPath?: string[];
    title?: string;
    fqidRefs?: any[];
    version?: string;
    entitiesCount?: number;
    name?: string;
    description?: string;
    author?: string;
    tags?: string[];
    updatedAt?: string | null;
    updatedAtSource?: string | null;
    createdAt?: string | null;
    createdAtSource?: string | null;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label?: string;
    fullLabel?: string;
    kind: "linkage" | "fqid" | "aggregated";
    title?: string;
    fqidRefs?: any[];
    linkData?: any;
    refCount?: number;
    side1Domain?: string | null;
    side2Domain?: string | null;
  }>;
  entities?: any[];
  cacheDiff?: any;
}

declare global {
  interface Window {
    __GRAPH_DATA__?: GraphData;
    __REMOTE_INFO__?: any;
    __REFRESH_COMMAND__?: string | null;
  }
}

export function readGraphData(): GraphData {
  const el = document.getElementById("graph-data");
  if (!el) {
    console.warn(
      "[domains-analyzer] #graph-data не найден — рендер пустого графа",
    );
    return { nodes: [], edges: [] };
  }
  try {
    const parsed = JSON.parse(el.textContent || "{}");
    if (!parsed || typeof parsed !== "object") {
      return { nodes: [], edges: [] };
    }
    // Защита от битых массивов
    if (!Array.isArray(parsed.nodes)) parsed.nodes = [];
    if (!Array.isArray(parsed.edges)) parsed.edges = [];
    return parsed;
  } catch (err) {
    console.warn("[domains-analyzer] не удалось распарсить #graph-data", err);
    return { nodes: [], edges: [] };
  }
}

export function readRemoteInfo(): any {
  const el = document.getElementById("remote-info");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "null");
  } catch {
    return null;
  }
}

export function readRefreshCommand(): string | null {
  const el = document.getElementById("refresh-command");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "null");
  } catch {
    return null;
  }
}

export function buildInitialNodes(data: GraphData): RFNode[] {
  const raw = data.nodes
    .filter((n) => n && n.id && typeof n.id === "string")
    .map((n): RFNode => {
      const domainId =
        n.domainId || n.id.replace(/^(domain_|missing_|broken_)/, "");
      return {
        id: n.id,
        type: "domainNode",
        data: {
          domainId,
          label: n.label,
          nodeType: n.group,
          filePath: n.filePath || null,
          folderPath: n.folderPath || [],
          fqidRefs: n.fqidRefs || [],
          version: n.version,
          entitiesCount: n.entitiesCount,
          name: n.name || n.label || "",
          description: n.description || "",
          author: n.author || "",
          tags: Array.isArray(n.tags) ? n.tags : [],
          updatedAt: n.updatedAt || null,
          updatedAtSource: (n.updatedAtSource as any) || null,
          createdAt: n.createdAt || null,
          createdAtSource: (n.createdAtSource as any) || null,
        },
        position: { x: 0, y: 0 },
      };
    });

  const edges = buildInitialEdges(data);
  return dagreLayout(raw, edges, "LR");
}

export function buildInitialEdges(data: GraphData): RFEdge[] {
  return data.edges
    .filter((e) => e && e.id && e.from && e.to)
    .map((e): RFEdge => {
      const isLinkage = e.kind === "linkage";
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        type: "smoothstep",
        label: e.label,
        data: {
          fqidRefs: e.fqidRefs || [],
          linkData: e.linkData || null,
          fullLabel: e.fullLabel || e.label || e.id,
          kind: e.kind,
          refCount: e.refCount,
          side1Domain: e.side1Domain || null,
          side2Domain: e.side2Domain || null,
        },
        markerEnd: {
          type: "arrowclosed",
          color: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
          width: 14,
          height: 14,
        },
        style: {
          stroke: isLinkage ? LINKAGE_COLOR : FQID_COLOR,
          strokeWidth: 1.0,
          opacity: 0.5,
        },
      };
    });
}
