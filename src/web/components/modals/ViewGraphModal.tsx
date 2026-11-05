import React, {
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import ReactFlow, {
    Background,
    BackgroundVariant,
    BaseEdge,
    Controls,
    EdgeProps,
    getSmoothStepPath,
    Handle,
    MiniMap,
    NodeTypes,
    Position,
    ReactFlowProvider,
    useReactFlow,
} from "reactflow";
import dagre from "dagre";

import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import { DomainCombobox } from "../common/DomainCombobox";
import { openFileInEditor } from "../../lib/open-file";
import {
    buildViewGraph,
    findViewPath,
    shortEntity,
    ViewGraphResult,
    ViewGraphNode,
    ViewEdgeKind,
    ViewNodeKind,
} from "../../lib/model/view-graph";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";

// ============ Constants ============

const NODE_WIDTH = 200;
const NODE_HEIGHT = 52;
const GRAPH_LIMIT = 500;

const EDGE_COLORS: Record<ViewEdgeKind, string> = {
    action: "#f59e0b",
    tabs: "#10b981",
    nested: "#a78bfa",
    menu: "#6366f1",
    dashboard: "#06b6d4",
    mixin: "#ec4899",
};

const EDGE_LABELS: Record<ViewEdgeKind, string> = {
    action: "Action",
    tabs: "Tabs",
    nested: "Nested",
    menu: "Menu",
    dashboard: "Dashboard",
    mixin: "Mixin",
};

const EDGE_DESCRIPTIONS: Record<ViewEdgeKind, string> = {
    action: "Action вызывает view (modal / panel / pageView / view)",
    tabs: "tabs_list содержит view-вкладку",
    nested: "Родительский view содержит вложенный (panel / modal / page)",
    menu: "Пункт меню ведёт на view",
    dashboard: "dashboard_tree собирает view на дашборде",
    mixin: "Миксин расширяет entity-view",
};

const NODE_COLORS: Record<string, string> = {
    entity: "#6366f1",
    list: "#10b981",
    panel: "#a78bfa",
    modal: "#f59e0b",
    page: "#ec4899",
    tabs_list: "#06b6d4",
    dashboard: "#f97316",
    dashboard_tree: "#eab308",
    menu: "#818cf8",
    menuItem: "#a5b4fc",
    unknown: "#64748b",
};

const VIEW_KIND_LABELS: Record<ViewNodeKind, string> = {
    entity: "entity",
    list: "list",
    panel: "panel",
    modal: "modal",
    page: "page",
    tabs_list: "tabs_list",
    dashboard: "dashboard",
    dashboard_tree: "dashboard_tree",
    menu: "menu",
    menuItem: "menuItem",
    unknown: "unknown",
};

type Layout = "LR" | "TB" | "force";
type PathMode = "none" | "pick-first" | "pick-second";

// ============ Helpers ============

function hueForKind(kind: string): number {
    let h = 0;
    for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
}

function layoutDagre(nodes: any[], edges: any[], rankdir: "LR" | "TB"): any[] {
    if (nodes.length === 0) return nodes;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir, nodesep: 30, ranksep: 90, marginx: 40, marginy: 40 });
    const ids = new Set(nodes.map((n) => n.id));
    nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    edges.forEach((e) => {
        if (ids.has(e.source) && ids.has(e.target)) g.setEdge(e.source, e.target);
    });
    dagre.layout(g);
    return nodes.map((n) => {
        const pos = g.node(n.id);
        return {
            ...n,
            position: pos ? { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } : { x: 0, y: 0 },
        };
    });
}

function layoutForce(nodes: any[], edges: any[]): any[] {
    const n = nodes.length;
    if (n === 0) return nodes;
    const pos = nodes.map((_, i) => {
        const a = (i / n) * 2 * Math.PI;
        const r = Math.min(1200, n * 14);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
    const idx = new Map<string, number>();
    nodes.forEach((nd, i) => idx.set(nd.id, i));
    const links = edges
        .map((e) => [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined])
        .filter((x): x is [number, number] => x[0] != null && x[1] != null);

    for (let iter = 0; iter < 180; iter++) {
        const fx = new Array(n).fill(0);
        const fy = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = pos[j].x - pos[i].x;
                const dy = pos[j].y - pos[i].y;
                const d2 = dx * dx + dy * dy + 0.01;
                const d = Math.sqrt(d2);
                const f = 5000 / d2;
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
            const ff = (dd - 220) * 0.02;
            fx[a] += (ddx / dd) * ff;
            fy[a] += (ddy / dd) * ff;
            fx[b] -= (ddx / dd) * ff;
            fy[b] -= (ddy / dd) * ff;
        }
        const alpha = 1 - iter / 180;
        for (let m = 0; m < n; m++) {
            pos[m].x += fx[m] * alpha * 0.5;
            pos[m].y += fy[m] * alpha * 0.5;
        }
    }
    return nodes.map((nd, i) => ({ ...nd, position: pos[i] }));
}

function layoutGraph(nodes: any[], edges: any[], layout: Layout): any[] {
    if (layout === "force") return layoutForce(nodes, edges);
    return layoutDagre(nodes, edges, layout);
}

// ============ Node ============

interface NodeData {
    node: ViewGraphNode;
    isSelected: boolean;
    isDimmed: boolean;
    isPath: boolean;
    isMatch: boolean;
}

function ViewNodeComponent({ data }: { data: NodeData }) {
    const n = data.node;
    const cls = ["view-graph-node", `view-graph-node--${n.kind}`];
    if (n.isMixin) cls.push("view-graph-node--mixin");
    if (n.isOrphan) cls.push("view-graph-node--orphan");
    if (n.unresolved) cls.push("view-graph-node--unresolved");
    if (n.isHub) cls.push("view-graph-node--hub");
    if (data.isSelected) cls.push("view-graph-node--selected");
    if (data.isPath) cls.push("view-graph-node--path");
    if (data.isDimmed) cls.push("view-graph-node--dimmed");
    if (data.isMatch) cls.push("view-graph-node--match");

    const color = NODE_COLORS[n.kind] || "#64748b";
    const title = `${n.viewId}\n${n.kind}${n.entity ? " · " + shortEntity(n.entity) : ""}\n${n.domainId}\n↓${n.inDegree} ↑${n.outDegree}`;

    return (
        <>
            <Handle type="target" position={Position.Left} className="view-graph-handle" />
            <div
                className={cls.join(" ")}
                style={{ borderLeftColor: color }}
                title={title}
            >
                <div className="view-graph-node__id">{n.viewId}</div>
                <div className="view-graph-node__meta">
                    <span className="view-graph-node__kind" style={{ color }}>
                        {n.kind}
                    </span>
                    {n.entity && (
                        <span className="view-graph-node__entity">
                            · {shortEntity(n.entity)}
                        </span>
                    )}
                </div>
                {n.isHub && <span className="vg-badge vg-badge--hub">HUB</span>}
                {n.isOrphan && <span className="vg-badge vg-badge--orphan">∅</span>}
                {n.unresolved && <span className="vg-badge vg-badge--warn" title="Entity не найдена">⚠</span>}
            </div>
            <Handle type="source" position={Position.Right} className="view-graph-handle" />
        </>
    );
}

const nodeTypes: NodeTypes = { viewNode: ViewNodeComponent as any };

// ============ Edge ============

function ViewEdgeComponent({
    id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    style, markerEnd, data,
}: EdgeProps) {
    const [path] = getSmoothStepPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 8,
    });
    const title = (data && (data as any).title) || "";
    return (
        <>
            <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
            <path d={path} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: "pointer" }}>
                <title>{title}</title>
            </path>
        </>
    );
}

const edgeTypes = { viewEdge: ViewEdgeComponent as any };

// ============ Inner ============

interface InnerProps {
    nodes: any[];
    edges: any[];
    onNodeClick: (id: string) => void;
    onNodeHover: (id: string) => void;
    onNodeLeave: () => void;
    onReady: (api: { fitView: () => void; centerOn: (x: number, y: number) => void }) => void;
}

function Inner({ nodes, edges, onNodeClick, onNodeHover, onNodeLeave, onReady }: InnerProps) {
    const rf = useReactFlow();
    useEffect(() => {
        onReady({
            fitView: () => { try { rf.fitView({ duration: 400, padding: 0.15 }); } catch { /* ignore */ } },
            centerOn: (x, y) => { try { rf.setCenter(x, y, { zoom: 1.2, duration: 500 }); } catch { /* ignore */ } },
        });
    }, [rf, onReady]);
    useEffect(() => {
        if (nodes.length === 0) return;
        const t = setTimeout(() => { try { rf.fitView({ duration: 400, padding: 0.15 }); } catch { /* ignore */ } }, 120);
        return () => clearTimeout(t);
    }, [nodes.length, edges.length, rf]);
    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, n) => onNodeClick(n.id)}
            onNodeMouseEnter={(_, n) => onNodeHover(n.id)}
            onNodeMouseLeave={onNodeLeave}
            fitView
            minZoom={0.05}
            maxZoom={3}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
        >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-dots)" />
            <Controls position="bottom-left" />
            <MiniMap
                position="bottom-right"
                nodeColor={(n: any) => NODE_COLORS[n.data?.node?.kind] || "#64748b"}
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 160, height: 120 }}
            />
        </ReactFlow>
    );
}

// ============ Detail panel ============

function ViewDetailPanel({
    node,
    graph,
    onClose,
    onFocus,
    onPath,
    onOpenYaml,
    onOpenSchema,
    onOpenEntity,
    onSelectNode,
}: {
    node: ViewGraphNode;
    graph: ViewGraphResult;
    onClose: () => void;
    onFocus: () => void;
    onPath: () => void;
    onOpenYaml: () => void;
    onOpenSchema: () => void;
    onOpenEntity: () => void;
    onSelectNode: (id: string) => void;
}) {
    const incoming = graph.edges.filter((e) => e.target === node.id);
    const outgoing = graph.edges.filter((e) => e.source === node.id);

    // Смежные узлы (по incoming + outgoing)
    const neighborIds = new Set<string>();
    for (const e of incoming) neighborIds.add(e.source);
    for (const e of outgoing) neighborIds.add(e.target);

    return (
        <div className="view-graph-detail">
            <div className="view-graph-detail__head">
                <span
                    className="view-graph-detail__kind-dot"
                    style={{ background: NODE_COLORS[node.kind] || "#64748b" }}
                />
                <code className="view-graph-detail__id">{node.viewId}</code>
                <button className="view-graph-detail__close" onClick={onClose} title="Закрыть">
                    ✕
                </button>
            </div>

            {node.label && (
                <div className="view-graph-detail__label">{node.label}</div>
            )}

            <div className="view-graph-detail__meta">
                <span className="view-graph-detail__badge">{node.kind}</span>
                <span className="view-graph-detail__badge">{node.domainId}</span>
                {node.isMixin && <span className="view-graph-detail__badge view-graph-detail__badge--mixin">mixin</span>}
                {node.unresolved && (
                    <span className="view-graph-detail__badge view-graph-detail__badge--err" title="Entity не найдена">
                        ⚠ unresolved
                    </span>
                )}
                {node.isOrphan && <span className="view-graph-detail__badge view-graph-detail__badge--warn">∅ сирота</span>}
                {node.isHub && <span className="view-graph-detail__badge view-graph-detail__badge--hub">★ hub</span>}
            </div>

            {node.entity && (
                <div className="view-graph-detail__entity">
                    <MIcon name="data_object" size="sm" />
                    <code>{node.entity}</code>
                </div>
            )}

            <div className="view-graph-detail__stats">
                <div className="view-graph-detail__stat">
                    <div className="view-graph-detail__stat-value">{node.inDegree}</div>
                    <div className="view-graph-detail__stat-label">входящих</div>
                </div>
                <div className="view-graph-detail__stat">
                    <div className="view-graph-detail__stat-value">{node.outDegree}</div>
                    <div className="view-graph-detail__stat-label">исходящих</div>
                </div>
                <div className="view-graph-detail__stat">
                    <div className="view-graph-detail__stat-value">{neighborIds.size}</div>
                    <div className="view-graph-detail__stat-label">соседей</div>
                </div>
            </div>

            <div className="view-graph-detail__actions">
                <button className="btn btn--primary btn--small" onClick={onFocus}>
                    <MIcon name="center_focus_strong" size="sm" /> Фокус
                </button>
                <button className="btn btn--small" onClick={onPath} title="Найти путь до…">
                    <MIcon name="route" size="sm" /> Путь
                </button>
                <button className="btn btn--small" onClick={onOpenYaml} title="Открыть YAML">
                    <MIcon name="description" size="sm" />
                </button>
                <button className="btn btn--small" onClick={onOpenSchema} title="Открыть схему домена">
                    <MIcon name="menu_book" size="sm" />
                </button>
                {node.entity && (
                    <button className="btn btn--small" onClick={onOpenEntity} title="Открыть сущность в каталоге">
                        <MIcon name="hub" size="sm" />
                    </button>
                )}
            </div>

            {outgoing.length > 0 && (
                <DetailSection title={`Исходящие (${outgoing.length})`} icon="call_made">
                    {outgoing.slice(0, 12).map((e) => {
                        const target = graph.nodes.find((n) => n.id === e.target);
                        return (
                            <button
                                key={e.id}
                                className="view-graph-detail__edge"
                                onClick={() => onSelectNode(e.target)}
                                title={e.detail || e.label || ""}
                            >
                                <span
                                    className="view-graph-detail__edge-kind"
                                    style={{ color: EDGE_COLORS[e.kind] }}
                                >
                                    {EDGE_LABELS[e.kind]}
                                </span>
                                <code>{target?.viewId || e.target}</code>
                            </button>
                        );
                    })}
                    {outgoing.length > 12 && (
                        <div className="view-graph-detail__more">+{outgoing.length - 12}</div>
                    )}
                </DetailSection>
            )}

            {incoming.length > 0 && (
                <DetailSection title={`Входящие (${incoming.length})`} icon="call_received">
                    {incoming.slice(0, 12).map((e) => {
                        const src = graph.nodes.find((n) => n.id === e.source);
                        return (
                            <button
                                key={e.id}
                                className="view-graph-detail__edge"
                                onClick={() => onSelectNode(e.source)}
                                title={e.detail || e.label || ""}
                            >
                                <span
                                    className="view-graph-detail__edge-kind"
                                    style={{ color: EDGE_COLORS[e.kind] }}
                                >
                                    {EDGE_LABELS[e.kind]}
                                </span>
                                <code>{src?.viewId || e.source}</code>
                            </button>
                        );
                    })}
                    {incoming.length > 12 && (
                        <div className="view-graph-detail__more">+{incoming.length - 12}</div>
                    )}
                </DetailSection>
            )}
        </div>
    );
}

function DetailSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
    return (
        <div className="view-graph-detail__section">
            <div className="view-graph-detail__section-title">
                <MIcon name={icon} size="sm" />
                {title}
            </div>
            <div className="view-graph-detail__section-body">{children}</div>
        </div>
    );
}

// ============ Prefs ============

const PREFS_KEY = "dg-view-graph-prefs";
interface Prefs {
    layout: Layout;
    showEdgeLabels: boolean;
    showInheritanceNested: boolean;
    hideOrphans: boolean;
    edgeKinds: ViewEdgeKind[];
}
const DEFAULT_PREFS: Prefs = {
    layout: "LR",
    showEdgeLabels: false,
    showInheritanceNested: true,
    hideOrphans: false,
    edgeKinds: ["action", "tabs", "nested", "menu", "dashboard", "mixin"],
};
function loadPrefs(): Prefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return DEFAULT_PREFS;
        return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
        return DEFAULT_PREFS;
    }
}

// ============ Main ============

export function ViewGraphModal() {
    const open = useGraphStore((s) => s.viewGraphOpen);
    const setOpen = useGraphStore((s) => s.setViewGraphOpen);
    const setDomainSchemaDomainId = useGraphStore((s) => s.setDomainSchemaDomainId);
    const setDomainSchemaOpen = useGraphStore((s) => s.setDomainSchemaOpen);
    const setEntityCatalogInitialFqid = useGraphStore((s) => s.setEntityCatalogInitialFqid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const { index, loading, error } = useModelIndex();
    const nodes = useGraphStore((s) => s.nodes);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    const prefs = useMemo(loadPrefs, []);
    const [layout, setLayout] = useState<Layout>(prefs.layout);
    const [showEdgeLabels, setShowEdgeLabels] = useState(prefs.showEdgeLabels);
    const [hideOrphans, setHideOrphans] = useState(prefs.hideOrphans);
    const [includeNested, setIncludeNested] = useState(true);
    const [includeMixins, setIncludeMixins] = useState(true);
    const [includeDash, setIncludeDash] = useState(true);
    const [includeMenus, setIncludeMenus] = useState(true);
    const [edgeKinds, setEdgeKinds] = useState<Set<ViewEdgeKind>>(
        new Set(prefs.edgeKinds),
    );
    const [nodeKinds, setNodeKinds] = useState<Set<ViewNodeKind>>(new Set());
    const [domainFilter, setDomainFilter] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearch = useDeferredValue(searchQuery);

    // Focus
    const [focusId, setFocusId] = useState<string | null>(null);
    const [focusDepth, setFocusDepth] = useState(2);

    // Selection + hover
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Path
    const [pathMode, setPathMode] = useState<PathMode>("none");
    const [pathFrom, setPathFrom] = useState<string | null>(null);
    const [pathTo, setPathTo] = useState<string | null>(null);
    const [pathResult, setPathResult] = useState<{ nodes: string[]; edges: string[] } | null>(null);

    const [rfApi, setRfApi] = useState<{ fitView: () => void; centerOn: (x, y) => void } | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Persist
    useEffect(() => {
        try {
            localStorage.setItem(
                PREFS_KEY,
                JSON.stringify({
                    layout,
                    showEdgeLabels,
                    hideOrphans,
                    edgeKinds: Array.from(edgeKinds),
                }),
            );
        } catch { /* ignore */ }
    }, [layout, showEdgeLabels, hideOrphans, edgeKinds]);

    // Reset on open
    useEffect(() => {
        if (!open) return;
        setFocusId(null);
        setSelectedId(null);
        setPathMode("none");
        setPathFrom(null);
        setPathTo(null);
        setPathResult(null);
        setSearchQuery("");
    }, [open]);

    // Default domain
    useEffect(() => {
        if (open && !domainFilter && nodes.length > 0) {
            const firstDomain = nodes.find((n) => n.data.nodeType === "domain");
            if (firstDomain) setDomainFilter(firstDomain.data.domainId);
        }
    }, [open, domainFilter, nodes]);

    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const graph: ViewGraphResult | null = useMemo(() => {
        if (!index) return null;
        const domains = domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined;
        return buildViewGraph(index, {
            domains,
            includeNested,
            includeMixins,
            includeDashboards: includeDash,
            includeMenus,
            hideOrphans,
            showEdgeKinds: edgeKinds,
            showNodeKinds: nodeKinds,
            focusId: focusId || undefined,
            focusDepth,
            limit: GRAPH_LIMIT,
        });
    }, [
        index, domainFilter, includeNested, includeMixins, includeDash, includeMenus,
        hideOrphans, edgeKinds, nodeKinds, focusId, focusDepth,
    ]);

    // Base RF nodes
    const baseRfNodes = useMemo(() => {
        if (!graph) return [];
        return graph.nodes.map((n) => ({
            id: n.id,
            type: "viewNode",
            position: { x: 0, y: 0 },
            data: { node: n, isSelected: false, isDimmed: false, isPath: false, isMatch: false } as NodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        }));
    }, [graph]);

    // Base edges
    const baseRfEdges = useMemo(() => {
        if (!graph) return [];
        return graph.edges.map((e) => {
            const stroke = EDGE_COLORS[e.kind];
            const isCross = e.isCrossDomain;
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: "viewEdge",
                label: showEdgeLabels ? (e.label || EDGE_LABELS[e.kind]) : undefined,
                labelStyle: {
                    fill: isCross ? "#fbbf24" : "var(--text-400)",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono, monospace",
                },
                labelBgStyle: { fill: "var(--bg-850)", fillOpacity: 0.9 },
                labelBgPadding: [4, 2] as [number, number],
                data: { kind: e.kind, title: e.detail || `${EDGE_LABELS[e.kind]}: ${e.label || ""}` },
                style: {
                    stroke,
                    strokeWidth: isCross ? 2.5 : 1.5,
                    strokeDasharray: e.kind === "mixin" || e.kind === "dashboard" ? "5 3" : undefined,
                    opacity: isCross ? 0.95 : 0.75,
                },
                markerEnd: { type: "arrowclosed" as any, color: stroke, width: 12, height: 12 },
            };
        });
    }, [graph, showEdgeLabels]);

    const laidNodes = useMemo(
        () => layoutGraph(baseRfNodes, baseRfEdges, layout),
        [baseRfNodes, baseRfEdges, layout],
    );

    // Hover neighbors
    const neighborsOfHovered = useMemo<Set<string> | null>(() => {
        if (!hoveredId || !graph) return null;
        const s = new Set<string>([hoveredId]);
        for (const e of graph.edges) {
            if (e.source === hoveredId) s.add(e.target);
            else if (e.target === hoveredId) s.add(e.source);
        }
        return s;
    }, [hoveredId, graph]);

    const pathNodeSet = useMemo(() => (pathResult ? new Set(pathResult.nodes) : null), [pathResult]);
    const pathEdgeSet = useMemo(() => (pathResult ? new Set(pathResult.edges) : null), [pathResult]);

    const searchMatchId = useMemo(() => {
        if (!deferredSearch.trim() || !graph) return null;
        const q = deferredSearch.trim().toLowerCase();
        return (
            graph.nodes.find(
                (n) => n.viewId.toLowerCase().includes(q) || (n.label || "").toLowerCase().includes(q),
            )?.id || null
        );
    }, [deferredSearch, graph]);

    const styledNodes = useMemo(() => {
        if (!laidNodes.length) return laidNodes;
        return laidNodes.map((n) => {
            const isSelected = n.id === selectedId;
            const isPath = !!pathNodeSet?.has(n.id);
            const isMatch = n.id === searchMatchId;
            const isDimmed =
                neighborsOfHovered !== null && !neighborsOfHovered.has(n.id);
            return {
                ...n,
                data: { ...n.data, isSelected, isPath, isMatch, isDimmed },
                selected: isSelected,
            };
        });
    }, [laidNodes, selectedId, pathNodeSet, searchMatchId, neighborsOfHovered]);

    const styledEdges = useMemo(() => {
        if (!pathEdgeSet || baseRfEdges.length === 0) return baseRfEdges;
        return baseRfEdges.map((e) => {
            if (!pathEdgeSet.has(e.id)) return e;
            return {
                ...e,
                style: { ...e.style, stroke: "#fbbf24", strokeWidth: 3, opacity: 1 },
                animated: true,
                markerEnd: { ...e.markerEnd, color: "#fbbf24" },
            };
        });
    }, [baseRfEdges, pathEdgeSet]);

    // Handlers
    const handleNodeClick = useCallback(
        (id: string) => {
            if (pathMode === "pick-first") {
                setPathFrom(id);
                setPathMode("pick-second");
                return;
            }
            if (pathMode === "pick-second") {
                if (!pathFrom || id === pathFrom) return;
                if (graph) {
                    const res = findViewPath(graph, pathFrom, id);
                    if (res) {
                        setPathResult(res);
                        setPathTo(id);
                    } else {
                        useGraphStore.getState().showSnackbar("Путь не найден");
                    }
                }
                setPathMode("none");
                return;
            }
            setSelectedId(id);
        },
        [pathMode, pathFrom, graph],
    );

    const centerOnNode = useCallback(
        (id: string) => {
            const n = laidNodes.find((x) => x.id === id);
            if (!n || !rfApi) return;
            rfApi.centerOn(n.position.x + NODE_WIDTH / 2, n.position.y + NODE_HEIGHT / 2);
        },
        [laidNodes, rfApi],
    );

    const focusOn = useCallback((id: string) => {
        setFocusId(id);
        setSelectedId(id);
    }, []);

    const startPath = useCallback((fromId?: string) => {
        setPathResult(null);
        setPathTo(null);
        if (fromId) {
            setPathFrom(fromId);
            setPathMode("pick-second");
        } else {
            setPathFrom(null);
            setPathMode("pick-first");
        }
    }, []);

    const cancelPath = useCallback(() => {
        setPathMode("none");
        setPathFrom(null);
        setPathTo(null);
        setPathResult(null);
    }, []);

    const openYaml = useCallback(
        (nodeId: string) => {
            if (!index) return;
            const n = graph?.nodes.find((x) => x.id === nodeId);
            if (!n) return;
            const st = useGraphStore.getState();
            const fileNode = st.nodes.find(
                (x) => (x.data.domainId || "").toLowerCase() === n.domainId.toLowerCase(),
            );
            if (!fileNode?.data.filePath) {
                st.showSnackbar("Файл схемы не найден");
                return;
            }
            const fqidToJump = n.entity || null;
            setOpen(false);
            openFileInEditor(fileNode.data.filePath, fqidToJump, n.domainId);
        },
        [index, graph, setOpen],
    );

    const openSchema = useCallback(
        (domainId: string) => {
            setOpen(false);
            setDomainSchemaDomainId(domainId);
            setDomainSchemaOpen(true);
        },
        [setOpen, setDomainSchemaDomainId, setDomainSchemaOpen],
    );

    const openEntity = useCallback(
        (fqid: string) => {
            setOpen(false);
            setEntityCatalogInitialFqid(fqid);
            setEntityCatalogOpen(true);
        },
        [setOpen, setEntityCatalogInitialFqid, setEntityCatalogOpen],
    );

    const exportPNG = useCallback(async () => {
        const el = document.querySelector(".view-graph-flow") as HTMLElement | null;
        if (!el) return;
        try {
            const mod: any = await import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm" as any);
            const toPng = mod.toPng ?? mod.default?.toPng;
            if (typeof toPng !== "function") throw new Error("toPng not found");
            const bg = getComputedStyle(document.documentElement).getPropertyValue("--graph-bg").trim() || "#0a0e1a";
            const dataUrl = await toPng(el, { backgroundColor: bg, pixelRatio: 2 });
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `view-graph-${Date.now()}.png`;
            a.click();
        } catch (e: any) {
            useGraphStore.getState().showSnackbar("PNG: " + (e?.message || String(e)));
        }
    }, []);

    const exportDot = useCallback(() => {
        if (!graph) return;
        const lines: string[] = ["digraph Views {"];
        lines.push('  rankdir="LR";');
        lines.push('  node [shape=box, style=rounded, fontname="Inter"];');
        for (const n of graph.nodes) {
            const color = NODE_COLORS[n.kind] || "#64748b";
            const label = `${n.viewId}\\n${n.kind}${n.entity ? " · " + shortEntity(n.entity) : ""}`;
            lines.push(`  "${n.id}" [label="${label}", color="${color}"];`);
        }
        for (const e of graph.edges) {
            const color = EDGE_COLORS[e.kind];
            const style = e.kind === "mixin" || e.kind === "dashboard" ? "dashed" : "solid";
            lines.push(`  "${e.source}" -> "${e.target}" [label="${EDGE_LABELS[e.kind]}", color="${color}", style="${style}"];`);
        }
        lines.push("}");
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `view-graph-${Date.now()}.dot`;
        a.click();
        URL.revokeObjectURL(url);
    }, [graph]);

    const searchResults = useMemo(() => {
        if (!graph || !deferredSearch.trim()) return [];
        const q = deferredSearch.trim().toLowerCase();
        return graph.nodes
            .filter((n) => n.viewId.toLowerCase().includes(q) || (n.label || "").toLowerCase().includes(q))
            .slice(0, 10);
    }, [graph, deferredSearch]);

    const toggleEdgeKind = useCallback((k: ViewEdgeKind) => {
        setEdgeKinds((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    }, []);

    const toggleNodeKind = useCallback((k: ViewNodeKind) => {
        setNodeKinds((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    }, []);

    // Keyboard
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
                if (e.key === "Escape") {
                    setSearchQuery("");
                    (target as HTMLInputElement).blur();
                }
                return;
            }
            if (e.key === "/") {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === "Escape") {
                if (pathMode !== "none" || pathResult) cancelPath();
                else if (focusId) setFocusId(null);
                else if (selectedId) setSelectedId(null);
                else setOpen(false);
            } else if (e.key === "f" || e.key === "F") {
                rfApi?.fitView();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, pathMode, pathResult, focusId, selectedId, setOpen, cancelPath, rfApi]);

    if (!open) return null;

    const selectedNode = selectedId && graph ? graph.nodes.find((n) => n.id === selectedId) || null : null;

    return (
        <div className="help-overlay help-overlay--fullscreen" onMouseDown={() => setOpen(false)}>
            <div className="help-modal view-graph-modal" onMouseDown={(e) => e.stopPropagation()}>
                {/* === HEADER === */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="schema" size="sm" />
                        <span className="icon-label">Граф зависимостей views</span>
                        {graph && (
                            <span className="help-modal__badge">
                                {graph.stats.totalNodes} · {graph.stats.totalEdges}
                            </span>
                        )}
                        {graph && graph.stats.orphans > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{ background: "rgba(148,163,184,0.15)", color: "#94a3b8" }}
                                title="Осиротевшие views"
                            >
                                ∅ {graph.stats.orphans}
                            </span>
                        )}
                        {graph && graph.stats.unresolved > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}
                                title="Unresolved entity refs"
                            >
                                ⚠ {graph.stats.unresolved}
                            </span>
                        )}
                        {graph && graph.stats.crossDomainEdges > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                                title="Cross-domain рёбра"
                            >
                                ⇄ {graph.stats.crossDomainEdges}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Как читать?" />
                        <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body"><div className="help-modal__loading">Загрузка индекса…</div></div>
                )}
                {error && (
                    <div className="help-modal__body"><div style={{ color: "var(--danger)" }}>Ошибка: {error}</div></div>
                )}

                {index && graph && (
                    <div className="view-graph-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Граф зависимостей UI-представлений домена. Узлы — <strong>views</strong>,{" "}
                                    пункты меню и обёртки <code>dashboard_tree</code>. Рёбра — кто кого вызывает.
                                </HelpText>
                            </HelpSection>
                            <HelpSection title="Типы узлов (цвет полоски слева)">
                                <HelpList>
                                    <li><strong style={{ color: "#6366f1" }}>entity</strong> — карточка сущности</li>
                                    <li><strong style={{ color: "#10b981" }}>list</strong> — списочное представление</li>
                                    <li><strong style={{ color: "#a78bfa" }}>panel</strong> — панель (компактное)</li>
                                    <li><strong style={{ color: "#f59e0b" }}>modal</strong> — модальное окно</li>
                                    <li><strong style={{ color: "#ec4899" }}>page</strong> — полноэкранная карточка</li>
                                    <li><strong style={{ color: "#06b6d4" }}>tabs_list</strong> — набор вкладок</li>
                                    <li><strong style={{ color: "#f97316" }}>dashboard / dashboard_tree</strong> — дашборды</li>
                                    <li><strong style={{ color: "#818cf8" }}>menu / menuItem</strong> — пункты меню</li>
                                </HelpList>
                            </HelpSection>
                            <HelpSection title="Типы рёбер">
                                <HelpList>
                                    <li><strong style={{ color: "#f59e0b" }}>Action</strong> — action вызывает view (modal/panel/pageView/view)</li>
                                    <li><strong style={{ color: "#10b981" }}>Tabs</strong> — tabs_list содержит view-вкладку</li>
                                    <li><strong style={{ color: "#a78bfa" }}>Nested</strong> — вложенный view (panel/modal/page внутри entity)</li>
                                    <li><strong style={{ color: "#6366f1" }}>Menu</strong> — пункт меню ведёт на view</li>
                                    <li><strong style={{ color: "#06b6d4" }}>Dashboard</strong> — dashboard_tree собирает view</li>
                                    <li><strong style={{ color: "#ec4899" }}>Mixin</strong> — миксин расширяет entity-view</li>
                                    <li><strong style={{ color: "#fbbf24" }}>Толстые рёбра</strong> — cross-domain</li>
                                </HelpList>
                            </HelpSection>
                            <HelpSection title="Бейджи">
                                <HelpList>
                                    <li><strong>HUB</strong> — топ по degree (много входящих + исходящих)</li>
                                    <li><strong>∅</strong> — сирота (нет связей)</li>
                                    <li><strong>⚠</strong> — entity не найдена в индексе</li>
                                </HelpList>
                            </HelpSection>
                            <HelpSection title="Фокус / Path finder / Поиск">
                                <HelpText>
                                    <strong>Фокус</strong> — оставить только окрестность view на N шагов.
                                    <strong> Путь</strong> — кратчайший путь между двумя views.
                                    <strong> Поиск</strong> (<kbd>/</kbd>) — подсветка + dropdown.
                                    <strong> Hover</strong> — соседи подсвечиваются.
                                </HelpText>
                            </HelpSection>
                            <HelpSection title="Клавиатура">
                                <HelpList>
                                    <li><kbd>/</kbd> — поиск</li>
                                    <li><kbd>F</kbd> — fit view</li>
                                    <li><kbd>Esc</kbd> — снять путь / фокус / выделение / закрыть</li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {!showHelp && (
                            <>
                                {/* === STATS === */}
                                <div className="view-graph-stats">
                                    <div className="view-graph-stats__item">
                                        <MIcon name="data_object" size="sm" />
                                        <strong>{graph.stats.totalNodes}</strong> узлов
                                    </div>
                                    <div className="view-graph-stats__item">
                                        <MIcon name="link" size="sm" />
                                        <strong>{graph.stats.totalEdges}</strong> рёбер
                                    </div>
                                    {(["action", "tabs", "nested", "menu", "dashboard", "mixin"] as ViewEdgeKind[])
                                        .filter((k) => graph.stats.byEdgeKind[k] > 0)
                                        .map((k) => (
                                            <div key={k} className="view-graph-stats__item" style={{ color: EDGE_COLORS[k] }}>
                                                {EDGE_LABELS[k]}: {graph.stats.byEdgeKind[k]}
                                            </div>
                                        ))}
                                    {graph.stats.truncated > 0 && (
                                        <div className="view-graph-stats__item view-graph-stats__item--warn">
                                            +{graph.stats.truncated} скрыто
                                        </div>
                                    )}
                                </div>

                                {/* === TOOLBAR row 1 === */}
                                <div className="view-graph-toolbar">
                                    <div className="view-graph-toolbar__row">
                                        <DomainCombobox
                                            value={domainFilter}
                                            onChange={setDomainFilter}
                                            domains={allDomains}
                                            placeholder="Все домены"
                                            allowEmpty
                                            emptyLabel="Все домены"
                                        />
                                        <div className="view-graph-search">
                                            <MIcon name="search" size="sm" />
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                placeholder="Найти view… (/)"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                spellCheck={false}
                                            />
                                            {searchQuery && (
                                                <button className="view-graph-search__clear" onClick={() => setSearchQuery("")}>✕</button>
                                            )}
                                            {searchResults.length > 0 && (
                                                <div className="view-graph-search__dropdown">
                                                    {searchResults.map((n) => (
                                                        <button
                                                            key={n.id}
                                                            className="view-graph-search__item"
                                                            onClick={() => {
                                                                centerOnNode(n.id);
                                                                setSelectedId(n.id);
                                                                setSearchQuery("");
                                                            }}
                                                        >
                                                            <span
                                                                className="view-graph-search__dot"
                                                                style={{ background: NODE_COLORS[n.kind] || "#64748b" }}
                                                            />
                                                            <code>{n.viewId}</code>
                                                            <span>{n.kind}</span>
                                                            {n.isHub && <span className="vg-badge vg-badge--hub">HUB</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="view-graph-toolbar__spacer" />
                                        <button
                                            className={"btn btn--small" + (pathMode !== "none" || pathResult ? " btn--active" : "")}
                                            onClick={() => (pathMode !== "none" || pathResult ? cancelPath() : startPath())}
                                            title="Найти путь между двумя views"
                                        >
                                            <MIcon name="route" size="sm" />
                                            {pathMode !== "none" || pathResult ? "Отменить путь" : "Найти путь"}
                                        </button>
                                    </div>

                                    {/* === TOOLBAR row 2 === */}
                                    <div className="view-graph-toolbar__row">
                                        {/* Edge kinds */}
                                        <span className="view-graph-toolbar__label">Рёбра:</span>
                                        {(["action", "tabs", "nested", "menu", "dashboard", "mixin"] as ViewEdgeKind[]).map((k) => {
                                            const active = edgeKinds.has(k);
                                            return (
                                                <button
                                                    key={k}
                                                    type="button"
                                                    className={"view-graph-edge-chip" + (active ? " active" : "")}
                                                    onClick={() => toggleEdgeKind(k)}
                                                    title={EDGE_DESCRIPTIONS[k]}
                                                    style={{
                                                        borderColor: active ? EDGE_COLORS[k] : undefined,
                                                        color: active ? EDGE_COLORS[k] : undefined,
                                                        background: active ? `${EDGE_COLORS[k]}18` : undefined,
                                                    }}
                                                >
                                                    <span className="view-graph-edge-chip__dot" style={{ background: EDGE_COLORS[k] }} />
                                                    {EDGE_LABELS[k]}
                                                </button>
                                            );
                                        })}

                                        <div className="view-graph-toolbar__divider" />

                                        {/* Node kinds: только views (menu всегда включены) */}
                                        <span className="view-graph-toolbar__label">Views:</span>
                                        {(["entity", "list", "panel", "modal", "page", "tabs_list", "dashboard_tree"] as ViewNodeKind[]).map((k) => {
                                            const active = nodeKinds.has(k);
                                            const has = (graph.stats.byNodeKind[k] || 0) > 0;
                                            if (!active && !has) return null;
                                            return (
                                                <button
                                                    key={k}
                                                    type="button"
                                                    className={"view-graph-edge-chip" + (active ? " active" : "")}
                                                    onClick={() => toggleNodeKind(k)}
                                                    title={`Только ${k}`}
                                                    style={{
                                                        borderColor: active ? NODE_COLORS[k] : undefined,
                                                        color: active ? NODE_COLORS[k] : undefined,
                                                        background: active ? `${NODE_COLORS[k]}18` : undefined,
                                                    }}
                                                >
                                                    <span className="view-graph-edge-chip__dot" style={{ background: NODE_COLORS[k] }} />
                                                    {k}
                                                    <span className="view-graph-edge-chip__count">{graph.stats.byNodeKind[k] || 0}</span>
                                                </button>
                                            );
                                        })}

                                        <div className="view-graph-toolbar__spacer" />

                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} />
                                            <span>Скрыть сирот</span>
                                        </label>
                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} />
                                            <span>Nested</span>
                                        </label>
                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={includeMixins} onChange={(e) => setIncludeMixins(e.target.checked)} />
                                            <span>Mixins</span>
                                        </label>
                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={includeDash} onChange={(e) => setIncludeDash(e.target.checked)} />
                                            <span>Dashboard</span>
                                        </label>
                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={includeMenus} onChange={(e) => setIncludeMenus(e.target.checked)} />
                                            <span>Menu</span>
                                        </label>

                                        <div className="view-graph-toolbar__divider" />

                                        <label className="view-graph-check">
                                            <span>Раскладка:</span>
                                            <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)} className="view-graph-select">
                                                <option value="LR">LR</option>
                                                <option value="TB">TB</option>
                                                <option value="force">Force</option>
                                            </select>
                                        </label>
                                        <label className="view-graph-check">
                                            <input type="checkbox" checked={showEdgeLabels} onChange={(e) => setShowEdgeLabels(e.target.checked)} />
                                            <span>Подписи</span>
                                        </label>
                                        <button className="btn btn--icon btn--small" onClick={exportPNG} title="PNG">
                                            <MIcon name="image" size="sm" />
                                        </button>
                                        <button className="btn btn--icon btn--small" onClick={exportDot} title="Graphviz DOT">
                                            <MIcon name="account_tree" size="sm" />
                                        </button>
                                    </div>
                                </div>

                                {/* === FOCUS === */}
                                {focusId && (
                                    <div className="view-graph-focus-bar">
                                        <MIcon name="center_focus_strong" size="sm" />
                                        <span>Фокус:</span>
                                        <code>{graph.nodes.find((n) => n.id === focusId)?.viewId || focusId}</code>
                                        <span className="view-graph-focus-bar__depth">
                                            глубина
                                            <input
                                                type="range"
                                                min={1}
                                                max={5}
                                                value={focusDepth}
                                                onChange={(e) => setFocusDepth(parseInt(e.target.value, 10))}
                                            />
                                            <strong>{focusDepth}</strong>
                                        </span>
                                        <button className="view-graph-focus-bar__close" onClick={() => setFocusId(null)}>✕</button>
                                    </div>
                                )}

                                {/* === PATH === */}
                                {pathMode === "pick-first" && (
                                    <div className="view-graph-path-bar">
                                        <MIcon name="ads_click" size="sm" />
                                        Кликните <strong>первый view</strong> пути
                                    </div>
                                )}
                                {pathMode === "pick-second" && pathFrom && (
                                    <div className="view-graph-path-bar">
                                        <MIcon name="route" size="sm" />
                                        Начало: <code>{graph.nodes.find((n) => n.id === pathFrom)?.viewId || pathFrom}</code>.
                                        Кликните <strong>конечный view</strong>
                                    </div>
                                )}
                                {pathResult && pathFrom && pathTo && (
                                    <div className="view-graph-path-bar view-graph-path-bar--found">
                                        <MIcon name="check_circle" size="sm" />
                                        Путь:{" "}
                                        <code>{graph.nodes.find((n) => n.id === pathFrom)?.viewId || pathFrom}</code>
                                        {" → "}
                                        <code>{graph.nodes.find((n) => n.id === pathTo)?.viewId || pathTo}</code>
                                        <span className="view-graph-path-bar__meta">
                                            {pathResult.nodes.length} узлов · {pathResult.edges.length} рёбер
                                        </span>
                                        <button className="view-graph-path-bar__close" onClick={cancelPath}>✕</button>
                                    </div>
                                )}

                                {/* === CANVAS + DETAIL === */}
                                <div className="view-graph-canvas view-graph-canvas--with-detail">
                                    <div className="view-graph-flow">
                                        {graph.nodes.length === 0 ? (
                                            <div className="view-graph-empty">
                                                <MIcon name="info" size="xl" />
                                                <div className="view-graph-empty__title">
                                                    {graph.stats.focusedId
                                                        ? "Окрестность пуста"
                                                        : hideOrphans
                                                            ? "Все views — сироты"
                                                            : !domainFilter
                                                                ? "Нет cross-domain связей. Выберите конкретный домен"
                                                                : "В домене нет views"}
                                                </div>
                                                {(hideOrphans || nodeKinds.size > 0 || edgeKinds.size < 6) && (
                                                    <button className="btn" onClick={() => {
                                                        setHideOrphans(false);
                                                        setNodeKinds(new Set());
                                                        setEdgeKinds(new Set(["action", "tabs", "nested", "menu", "dashboard", "mixin"]));
                                                    }}>Сбросить фильтры</button>
                                                )}
                                            </div>
                                        ) : (
                                            <ReactFlowProvider>
                                                <Inner
                                                    nodes={styledNodes}
                                                    edges={styledEdges}
                                                    onNodeClick={handleNodeClick}
                                                    onNodeHover={setHoveredId}
                                                    onNodeLeave={() => setHoveredId(null)}
                                                    onReady={setRfApi}
                                                />
                                            </ReactFlowProvider>
                                        )}
                                    </div>

                                    {selectedNode && (
                                        <ViewDetailPanel
                                            node={selectedNode}
                                            graph={graph}
                                            onClose={() => setSelectedId(null)}
                                            onFocus={() => focusOn(selectedNode.id)}
                                            onPath={() => startPath(selectedNode.id)}
                                            onOpenYaml={() => openYaml(selectedNode.id)}
                                            onOpenSchema={() => openSchema(selectedNode.domainId)}
                                            onOpenEntity={() => selectedNode.entity && openEntity(selectedNode.entity)}
                                            onSelectNode={(id) => {
                                                setSelectedId(id);
                                                centerOnNode(id);
                                            }}
                                        />
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}