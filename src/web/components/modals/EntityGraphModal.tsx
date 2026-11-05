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
import { downloadEntityClassDiagram } from "../../lib/export";
import {
    buildEntityGraph,
    findEntityPath,
    shortEntityId,
    EntityGraphResult,
    EntityEdgeKind,
    EntityKind,
    EntityGraphNode,
} from "../../lib/model/entity-graph";
import { computeImpact } from "../../lib/model/impact-analysis";
import type { ModelIndex } from "../../../shared/model-types";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";

// ============ Константы ============

const GRAPH_LIMIT = 200;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 46;

const EDGE_COLORS: Record<EntityEdgeKind, string> = {
    inheritance: "#a78bfa",
    reference: "#6366f1",
    linkage: "#10b981",
};

type Layout = "LR" | "TB" | "force";

// ============ Utils ============

function hueForDomain(domainId: string): number {
    let hash = 0;
    for (let i = 0; i < domainId.length; i++) {
        hash = (hash * 31 + domainId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}

function layoutDagre(nodes: any[], edges: any[], rankdir: "LR" | "TB"): any[] {
    if (nodes.length === 0) return nodes;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir, nodesep: 30, ranksep: 80, marginx: 40, marginy: 40 });
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
            position: pos
                ? { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 }
                : { x: 0, y: 0 },
        };
    });
}

function layoutForce(nodes: any[], edges: any[]): any[] {
    const n = nodes.length;
    if (n === 0) return nodes;
    const pos = nodes.map((_, i) => {
        const a = (i / n) * 2 * Math.PI;
        return { x: Math.cos(a) * Math.min(900, n * 12), y: Math.sin(a) * Math.min(900, n * 12) };
    });
    const idx = new Map<string, number>();
    nodes.forEach((nd, i) => idx.set(nd.id, i));
    const links = edges
        .map(
            (e) =>
                [idx.get(e.source), idx.get(e.target)] as [number | undefined, number | undefined],
        )
        .filter((x): x is [number, number] => x[0] != null && x[1] != null);

    for (let iter = 0; iter < 200; iter++) {
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
            const ff = (dd - 200) * 0.02;
            fx[a] += (ddx / dd) * ff;
            fy[a] += (ddy / dd) * ff;
            fx[b] -= (ddx / dd) * ff;
            fy[b] -= (ddy / dd) * ff;
        }
        const alpha = 1 - iter / 200;
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

// ============ Node component ============

interface NodeData {
    node: EntityGraphNode;
    __domainHue: number;
    isSelected: boolean;
    isDimmed: boolean;
    isPath: boolean;
    isMatch: boolean;
}

function EntityNode({ data }: { data: NodeData }) {
    const n = data.node;
    const cls = ["entity-graph-node-card"];
    if (n.isHub) cls.push("entity-graph-node-card--hub");
    if (n.isOrphan) cls.push("entity-graph-node-card--orphan");
    if (data.isSelected) cls.push("entity-graph-node-card--selected");
    if (data.isPath) cls.push("entity-graph-node-card--path");
    if (data.isDimmed) cls.push("entity-graph-node-card--dimmed");
    if (data.isMatch) cls.push("entity-graph-node-card--match");

    const tooltip =
        `${n.entity.entityId}\n${n.domainId}\n` +
        `${n.entity.attributes.length} атрибутов · ${n.degree} связей\n` +
        (n.isHub ? "★ хаб" : n.isOrphan ? "∅ сирота" : "");

    return (
        <>
            <Handle type="target" position={Position.Top} className="entity-node-handle" />
            <div
                className={cls.join(" ")}
                style={{ borderLeftColor: `hsl(${data.__domainHue}, 60%, 55%)` }}
                title={tooltip}
            >
                <div className="entity-graph-node-card__id">{n.entityId}</div>
                <div className="entity-graph-node-card__domain">{n.domainId}</div>
                {n.isHub && <span className="egn-badge egn-badge--hub">HUB</span>}
                {n.isOrphan && <span className="egn-badge egn-badge--orphan">∅</span>}
            </div>
            <Handle type="source" position={Position.Bottom} className="entity-node-handle" />
        </>
    );
}

const nodeTypes: NodeTypes = { entityNode: EntityNode as any };

// ============ Edge component ============

function EntityEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
}: EdgeProps) {
    const [path] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
    });
    const title = (data && (data as any).title) || "";
    return (
        <>
            <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                style={{ cursor: "pointer" }}
            >
                <title>{title}</title>
            </path>
        </>
    );
}

const edgeTypes = { entityEdge: EntityEdge as any };

// ============ Inner ============

interface InnerProps {
    nodes: any[];
    edges: any[];
    onNodeClick: (fqid: string) => void;
    onNodeMouseEnter: (fqid: string) => void;
    onNodeMouseLeave: () => void;
    onReady: (api: { fitView: () => void; centerOn: (x: number, y: number) => void }) => void;
}

function EntityGraphInner({
    nodes,
    edges,
    onNodeClick,
    onNodeMouseEnter,
    onNodeMouseLeave,
    onReady,
}: InnerProps) {
    const rf = useReactFlow();

    useEffect(() => {
        onReady({
            fitView: () => {
                try { rf.fitView({ duration: 400, padding: 0.15 }); } catch { /* ignore */ }
            },
            centerOn: (x: number, y: number) => {
                try { rf.setCenter(x, y, { zoom: 1.2, duration: 500 }); } catch { /* ignore */ }
            },
        });
    }, [rf, onReady]);

    useEffect(() => {
        if (nodes.length === 0) return;
        const t = setTimeout(() => {
            try { rf.fitView({ duration: 400, padding: 0.15 }); } catch { /* ignore */ }
        }, 120);
        return () => clearTimeout(t);
    }, [nodes.length, edges.length, rf]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, n) => onNodeClick(n.id)}
            onNodeMouseEnter={(_, n) => onNodeMouseEnter(n.id)}
            onNodeMouseLeave={onNodeMouseLeave}
            fitView
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
        >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-dots)" />
            <Controls position="bottom-left" />
            <MiniMap
                position="bottom-right"
                nodeColor={(n: any) => `hsl(${n.data?.__domainHue ?? 220}, 60%, 55%)`}
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 160, height: 120 }}
            />
        </ReactFlow>
    );
}

// ============ Detail panel ============

function EntityDetailPanel({
    fqid,
    index,
    onClose,
    onFocus,
    onPath,
    onOpenCatalog,
    onOpenYaml,
}: {
    fqid: string;
    index: ModelIndex;
    onClose: () => void;
    onFocus: () => void;
    onPath: () => void;
    onOpenCatalog: () => void;
    onOpenYaml: () => void;
}) {
    const impact = useMemo(() => computeImpact(fqid, index), [fqid, index]);
    if (!impact) return null;
    const {
        entity,
        parent,
        children,
        referencedByAttributes,
        referencesToOthers,
        linkages,
        mixins,
    } = impact;

    return (
        <div className="entity-graph-detail">
            <div className="entity-graph-detail__head">
                <code className="entity-graph-detail__id">{entity.entityId}</code>
                <button className="entity-graph-detail__close" onClick={onClose} title="Закрыть">
                    ✕
                </button>
            </div>
            {entity.name && entity.name !== entity.entityId && (
                <div className="entity-graph-detail__name">{entity.name}</div>
            )}
            <div className="entity-graph-detail__meta">
                <span className="entity-graph-detail__badge">{entity.domainId}</span>
                <span className="entity-graph-detail__badge">{entity.attributes.length} атр.</span>
            </div>

            {entity.description && (
                <div className="entity-graph-detail__desc">{entity.description}</div>
            )}

            <div className="entity-graph-detail__actions">
                <button className="btn btn--primary btn--small" onClick={onFocus} title="Фокус на этой сущности">
                    <MIcon name="center_focus_strong" size="sm" /> Фокус
                </button>
                <button className="btn btn--small" onClick={onPath} title="Найти путь до…">
                    <MIcon name="route" size="sm" /> Путь
                </button>
                <button className="btn btn--small" onClick={onOpenCatalog} title="Открыть в каталоге">
                    <MIcon name="menu_book" size="sm" />
                </button>
                <button className="btn btn--small" onClick={onOpenYaml} title="Открыть YAML">
                    <MIcon name="description" size="sm" />
                </button>
            </div>

            {parent && (
                <DetailSection title="Родитель" icon="arrow_upward">
                    <code>{parent.entityId}</code>
                </DetailSection>
            )}

            {children.length > 0 && (
                <DetailSection title={`Наследники (${children.length})`} icon="arrow_downward">
                    {children.slice(0, 8).map((c) => (
                        <code key={c.fqid} className="entity-graph-detail__chip">
                            {c.entityId}
                        </code>
                    ))}
                    {children.length > 8 && (
                        <span className="entity-graph-detail__chip entity-graph-detail__chip--more">
                            +{children.length - 8}
                        </span>
                    )}
                </DetailSection>
            )}

            {referencesToOthers.length > 0 && (
                <DetailSection title={`Ссылается (${referencesToOthers.length})`} icon="call_made">
                    {referencesToOthers.slice(0, 5).map((r) => (
                        <div key={`${r.entity.fqid}#${r.attributeId}`} className="entity-graph-detail__ref">
                            <code>{r.attributeId}</code>
                            <span>→</span>
                            <span className="entity-graph-detail__ref-target">{r.entity.entityId}</span>
                        </div>
                    ))}
                    {referencesToOthers.length > 5 && (
                        <div className="entity-graph-detail__more">+{referencesToOthers.length - 5}</div>
                    )}
                </DetailSection>
            )}

            {referencedByAttributes.length > 0 && (
                <DetailSection title={`Ссылаются (${referencedByAttributes.length})`} icon="call_received">
                    {referencedByAttributes.slice(0, 5).map((r) => (
                        <div key={`${r.entity.fqid}#${r.attributeId}`} className="entity-graph-detail__ref">
                            <span className="entity-graph-detail__ref-target">{r.entity.entityId}</span>
                            <code>{r.attributeId}</code>
                        </div>
                    ))}
                    {referencedByAttributes.length > 5 && (
                        <div className="entity-graph-detail__more">+{referencedByAttributes.length - 5}</div>
                    )}
                </DetailSection>
            )}

            {linkages.length > 0 && (
                <DetailSection title={`Связи (${linkages.length})`} icon="link">
                    {linkages.slice(0, 5).map((l, i) => (
                        <div key={i} className="entity-graph-detail__ref">
                            <code>{l.linkageName || l.linkageId}</code>
                            <span className="entity-graph-detail__ref-target">
                                → {shortEntityId(l.peerFqid)}
                            </span>
                        </div>
                    ))}
                </DetailSection>
            )}

            {mixins.length > 0 && (
                <DetailSection title={`Миксины (${mixins.length})`} icon="merge">
                    {mixins.slice(0, 5).map((m) => (
                        <code key={`${m.domainId}#${m.id}`} className="entity-graph-detail__chip">
                            {m.id}
                        </code>
                    ))}
                </DetailSection>
            )}
        </div>
    );
}

function DetailSection({
    title,
    icon,
    children,
}: {
    title: string;
    icon: string;
    children: React.ReactNode;
}) {
    return (
        <div className="entity-graph-detail__section">
            <div className="entity-graph-detail__section-title">
                <MIcon name={icon} size="sm" />
                {title}
            </div>
            <div className="entity-graph-detail__section-body">{children}</div>
        </div>
    );
}

// ============ Main modal ============

type PathMode = "none" | "pick-first" | "pick-second";

export function EntityGraphModal() {
    const { index, loading, error } = useModelIndex();
    const open = useGraphStore((s) => s.entityGraphOpen);
    const setOpen = useGraphStore((s) => s.setEntityGraphOpen);
    const setEntityCatalogInitialFqid = useGraphStore((s) => s.setEntityCatalogInitialFqid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const nodes = useGraphStore((s) => s.nodes);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    // ---- Filters ----
    const [domainFilter, setDomainFilter] = useState("");
    const [includeNeighbors, setIncludeNeighbors] = useState(false);
    const [showInheritance, setShowInheritance] = useState(true);
    const [showReferences, setShowReferences] = useState(true);
    const [showLinkages, setShowLinkages] = useState(true);
    const [hideOrphans, setHideOrphans] = useState(false);
    const [layout, setLayout] = useState<Layout>("LR");
    const [showEdgeLabels, setShowEdgeLabels] = useState(false);

    // ---- Focus ----
    const [focusFqid, setFocusFqid] = useState<string | null>(null);
    const [focusDepth, setFocusDepth] = useState(2);

    // ---- Search ----
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearch = useDeferredValue(searchQuery);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // ---- Selection ----
    const [selectedFqid, setSelectedFqid] = useState<string | null>(null);
    const [hoveredFqid, setHoveredFqid] = useState<string | null>(null);

    // ---- Path finder ----
    const [pathMode, setPathMode] = useState<PathMode>("none");
    const [pathFrom, setPathFrom] = useState<string | null>(null);
    const [pathTo, setPathTo] = useState<string | null>(null);
    const [pathResult, setPathResult] = useState<{ nodes: string[]; edges: string[] } | null>(null);

    // ---- RF API ----
    const [rfApi, setRfApi] = useState<{ fitView: () => void; centerOn: (x: number, y: number) => void } | null>(null);

    // Reset on open
    useEffect(() => {
        if (!open) return;
        setFocusFqid(null);
        setSelectedFqid(null);
        setPathMode("none");
        setPathFrom(null);
        setPathTo(null);
        setPathResult(null);
        setSearchQuery("");
    }, [open]);

    // ---- Domains ----
    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // Auto-select first domain on open
    useEffect(() => {
        if (!open || !index || domainFilter || allDomains.length === 0) return;
        setDomainFilter(allDomains[0][0]);
    }, [open, index, allDomains, domainFilter]);

    // ---- Neighbor domains ----
    const effectiveDomains = useMemo<Set<string> | undefined>(() => {
        if (!domainFilter) return undefined;
        if (!includeNeighbors || !index) return new Set([domainFilter.toLowerCase()]);
        const target = domainFilter.toLowerCase();
        const result = new Set([target]);
        for (const e of index.entities) {
            const isInTarget = e.domainId.toLowerCase() === target;
            if (isInTarget) {
                if (e.inherits) {
                    const p = index.entitiesByFqid[e.inherits];
                    if (p) result.add(p.domainId.toLowerCase());
                }
                for (const a of e.attributes) {
                    const ref = a.referenceEntity || a.itemReferenceEntity;
                    if (!ref) continue;
                    const r = index.entitiesByFqid[ref];
                    if (r) result.add(r.domainId.toLowerCase());
                }
            } else {
                let touches = false;
                if (e.inherits) {
                    const p = index.entitiesByFqid[e.inherits];
                    if (p?.domainId.toLowerCase() === target) touches = true;
                }
                if (!touches) {
                    for (const a of e.attributes) {
                        const ref = a.referenceEntity || a.itemReferenceEntity;
                        if (!ref) continue;
                        const r = index.entitiesByFqid[ref];
                        if (r?.domainId.toLowerCase() === target) {
                            touches = true;
                            break;
                        }
                    }
                }
                if (touches) result.add(e.domainId.toLowerCase());
            }
        }
        return result;
    }, [domainFilter, includeNeighbors, index]);

    // ---- Build graph ----
    const graph: EntityGraphResult | null = useMemo(() => {
        if (!index) return null;
        return buildEntityGraph(index, {
            domains: effectiveDomains,
            showInheritance,
            showReferences,
            showLinkages,
            hideOrphans,
            kinds: undefined,
            focusFqid: focusFqid || undefined,
            focusDepth,
            limit: GRAPH_LIMIT,
        });
    }, [
        index,
        effectiveDomains,
        showInheritance,
        showReferences,
        showLinkages,
        hideOrphans,
        focusFqid,
        focusDepth,
    ]);

    // ---- Base RF nodes ----
    const baseRfNodes = useMemo(() => {
        if (!graph) return [];
        return graph.nodes.map((n) => ({
            id: n.id,
            type: "entityNode",
            position: { x: 0, y: 0 },
            data: {
                node: n,
                __domainHue: hueForDomain(n.domainId),
                isSelected: false,
                isDimmed: false,
                isPath: false,
                isMatch: false,
            } as NodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        }));
    }, [graph]);

    // ---- Base RF edges ----
    const baseRfEdges = useMemo(() => {
        if (!graph) return [];
        return graph.edges.map((e) => {
            const stroke = EDGE_COLORS[e.kind];
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: "entityEdge",
                label: showEdgeLabels ? e.label : undefined,
                labelStyle: { fill: "var(--text-400)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" },
                labelBgStyle: { fill: "var(--bg-850)", fillOpacity: 0.9 },
                labelBgPadding: [4, 2],
                data: { kind: e.kind, label: e.label, viaAttribute: e.viaAttribute, linkageId: e.linkageId, title: e.title || "" },
                style: {
                    stroke,
                    strokeWidth: e.kind === "inheritance" ? 2.5 : 1.5,
                    strokeDasharray: e.kind === "reference" ? "5 3" : undefined,
                    opacity: 0.85,
                },
                markerEnd: { type: "arrowclosed" as any, color: stroke, width: 12, height: 12 },
            };
        });
    }, [graph, showEdgeLabels]);

    // ---- Layout ----
    const laidNodes = useMemo(
        () => layoutGraph(baseRfNodes, baseRfEdges, layout),
        [baseRfNodes, baseRfEdges, layout],
    );

    // ---- Neighbors (для hover) ----
    const neighborsOfHovered = useMemo<Set<string> | null>(() => {
        if (!hoveredFqid || !graph) return null;
        const s = new Set<string>([hoveredFqid]);
        for (const e of graph.edges) {
            if (e.source === hoveredFqid) s.add(e.target);
            else if (e.target === hoveredFqid) s.add(e.source);
        }
        return s;
    }, [hoveredFqid, graph]);

    // ---- Path set ----
    const pathNodeSet = useMemo(() => {
        return pathResult ? new Set(pathResult.nodes) : null;
    }, [pathResult]);
    const pathEdgeSet = useMemo(() => {
        return pathResult ? new Set(pathResult.edges) : null;
    }, [pathResult]);

    // ---- Search match ----
    const searchMatchFqid = useMemo(() => {
        if (!deferredSearch.trim() || !graph) return null;
        const q = deferredSearch.trim().toLowerCase();
        return (
            graph.nodes.find((n) => n.entityId.toLowerCase().includes(q))?.id || null
        );
    }, [deferredSearch, graph]);

    // ---- Styled nodes ----
    const styledNodes = useMemo(() => {
        if (!laidNodes.length) return laidNodes;
        return laidNodes.map((n) => {
            const isSelected = n.id === selectedFqid;
            const isPath = !!pathNodeSet?.has(n.id);
            const isMatch = n.id === searchMatchFqid;
            const isDimmed =
                neighborsOfHovered !== null &&
                !neighborsOfHovered.has(n.id) &&
                n.id !== hoveredFqid;
            return {
                ...n,
                data: {
                    ...n.data,
                    isSelected,
                    isPath,
                    isMatch,
                    isDimmed,
                },
                selected: isSelected,
            };
        });
    }, [laidNodes, selectedFqid, pathNodeSet, searchMatchFqid, neighborsOfHovered, hoveredFqid]);

    // ---- Styled edges ----
    const styledEdges = useMemo(() => {
        if (!pathEdgeSet || baseRfEdges.length === 0) return baseRfEdges;
        return baseRfEdges.map((e) => {
            const isPath = pathEdgeSet.has(e.id);
            if (!isPath) return e;
            return {
                ...e,
                style: { ...e.style, stroke: "#fbbf24", strokeWidth: 3, opacity: 1 },
                animated: true,
                markerEnd: { ...e.markerEnd, color: "#fbbf24" },
            };
        });
    }, [baseRfEdges, pathEdgeSet]);

    // ---- Handlers ----

    const handleNodeClick = useCallback(
        (fqid: string) => {
            if (pathMode === "pick-first") {
                setPathFrom(fqid);
                setPathMode("pick-second");
                return;
            }
            if (pathMode === "pick-second") {
                if (!pathFrom || fqid === pathFrom) return;
                if (graph) {
                    const res = findEntityPath(graph, pathFrom, fqid);
                    if (res) {
                        setPathResult(res);
                        setPathTo(fqid);
                    } else {
                        useGraphStore.getState().showSnackbar("Путь не найден");
                    }
                }
                setPathMode("none");
                return;
            }
            setSelectedFqid(fqid);
        },
        [pathMode, pathFrom, graph],
    );

    const handleNodeHover = useCallback((fqid: string) => {
        setHoveredFqid(fqid);
    }, []);
    const handleNodeLeave = useCallback(() => {
        setHoveredFqid(null);
    }, []);

    const centerOnNode = useCallback(
        (fqid: string) => {
            const node = laidNodes.find((n) => n.id === fqid);
            if (!node || !rfApi) return;
            rfApi.centerOn(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2);
        },
        [laidNodes, rfApi],
    );

    const focusOn = useCallback(
        (fqid: string) => {
            setFocusFqid(fqid);
            setSelectedFqid(fqid);
        },
        [],
    );

    const startPath = useCallback((fromFqid?: string) => {
        setPathResult(null);
        setPathTo(null);
        if (fromFqid) {
            setPathFrom(fromFqid);
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

    const clearFocus = useCallback(() => {
        setFocusFqid(null);
    }, []);

    const openCatalog = useCallback(
        (fqid: string) => {
            setOpen(false);
            setEntityCatalogInitialFqid(fqid);
            setEntityCatalogOpen(true);
        },
        [setOpen, setEntityCatalogInitialFqid, setEntityCatalogOpen],
    );

    const openYaml = useCallback(
        (fqid: string) => {
            const st = useGraphStore.getState();
            const node = st.nodes.find(
                (n) => (n.data.domainId || "").toLowerCase() === fqid.split("/")[0].toLowerCase(),
            );
            if (!node?.data.filePath) {
                st.showSnackbar("Файл схемы не найден");
                return;
            }
            setOpen(false);
            openFileInEditor(node.data.filePath, fqid, fqid.split("/")[0]);
        },
        [setOpen],
    );

    const exportPNG = useCallback(async () => {
        const el = document.querySelector(".entity-graph-flow") as HTMLElement | null;
        if (!el) return;
        try {
            const mod: any = await import("https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm" as any);
            const toPng = mod.toPng ?? mod.default?.toPng;
            if (typeof toPng !== "function") throw new Error("toPng not found");
            const bg = getComputedStyle(document.documentElement).getPropertyValue("--graph-bg").trim() || "#0a0e1a";
            const dataUrl = await toPng(el, { backgroundColor: bg, pixelRatio: 2 });
            const a = document.createElement("a");
            a.href = dataUrl;
            a.download = `entity-graph-${Date.now()}.png`;
            a.click();
        } catch (e: any) {
            useGraphStore.getState().showSnackbar("PNG: " + (e?.message || String(e)));
        }
    }, []);

    const exportClassDiagram = useCallback(() => {
        if (!graph) return;
        downloadEntityClassDiagram(graph, { includeStereotype: true, maxAttributes: 30 }, domainFilter || "all");
    }, [graph, domainFilter]);

    // Search dropdown
    const searchResults = useMemo(() => {
        if (!graph || !deferredSearch.trim()) return [];
        const q = deferredSearch.trim().toLowerCase();
        return graph.nodes
            .filter((n) => n.entityId.toLowerCase().includes(q) || n.entity.domainId.toLowerCase().includes(q))
            .slice(0, 10);
    }, [graph, deferredSearch]);

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
                else if (focusFqid) clearFocus();
                else if (selectedFqid) setSelectedFqid(null);
                else setOpen(false);
            } else if (e.key === "f" || e.key === "F") {
                rfApi?.fitView();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, pathMode, pathResult, focusFqid, selectedFqid, setOpen, cancelPath, clearFocus, rfApi]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal entity-graph-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* === HEADER === */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="hub" size="sm" />
                        <span className="icon-label">Граф сущностей</span>
                        {graph && (
                            <span className="help-modal__badge">
                                {graph.stats.totalNodes} · {graph.edges.length}
                            </span>
                        )}
                        {graph && graph.stats.orphans > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{ background: "rgba(148,163,184,0.15)", color: "#94a3b8" }}
                                title="Сироты (0 связей)"
                            >
                                ∅ {graph.stats.orphans}
                            </span>
                        )}
                        {graph && graph.stats.hubs > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                                title="Хабы (топ по связям)"
                            >
                                ★ {graph.stats.hubs}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Как читать?" />
                        <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса…</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && graph && (
                    <div className="entity-graph-modal-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Уровень между графом доменов и матрицей: узлы — <strong>сущности</strong>,
                                    рёбра — три типа связей. Полезно для оценки плотности,
                                    поиска хабов и «мёртвых» сущностей в домене.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Цвета рёбер">
                                <HelpList>
                                    <li><strong style={{ color: "#a78bfa" }}>Фиолетовые толстые</strong> — наследование.</li>
                                    <li><strong style={{ color: "#6366f1" }}>Синие пунктирные</strong> — Reference-атрибут.</li>
                                    <li><strong style={{ color: "#10b981" }}>Зелёные сплошные</strong> — linkage.</li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Бейджи на узлах">
                                <HelpList>
                                    <li><strong>HUB</strong> — входит в топ-5 по степени связности (и ≥3). Обычно — центральная модель домена.</li>
                                    <li><strong>∅</strong> — сирота: 0 связей. Мёртвый код или недоделанная фича.</li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Поиск">
                                <HelpText>
                                    Введите id/имя сущности в поиск (или <kbd>/</kbd>). Совпадения подсвечиваются
                                    на графе. Клик по результату — центрировать.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Фокус">
                                <HelpText>
                                    Кнопка «Фокус» в деталях сущности оставляет только её окрестность на N шагов
                                    (регулятор глубины 1–5). Полезно при 100+ узлах: видно только то, что связано
                                    с выбранной сущностью.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Path finder">
                                <HelpText>
                                    Кнопка «Найти путь» → клик по первому узлу → клик по второму. Кратчайший
                                    путь подсвечивается жёлтым. Работает в пределах текущего графа
                                    (после focus/filters).
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Hover">
                                <HelpText>
                                    При наведении на узел все несвязанные сущности затемняются. Видно
                                    «окружение» без кликов.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Соседние домены">
                                <HelpText>
                                    Чекбокс «Соседние домены» добавляет к текущему домену все, что имеют
                                    Reference или inherits в обе стороны. Видно cross-domain связи без
                                    загрузки всего проекта.
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
                                {/* === STATS BAR === */}
                                <div className="entity-graph-stats">
                                    <div className="entity-graph-stats__item">
                                        <MIcon name="data_object" size="sm" />
                                        <strong>{graph.stats.totalNodes}</strong> сущностей
                                    </div>
                                    <div className="entity-graph-stats__item">
                                        <MIcon name="link" size="sm" />
                                        <strong>{graph.edges.length}</strong> связей
                                    </div>
                                    {graph.stats.byKind.inheritance > 0 && (
                                        <div className="entity-graph-stats__item" style={{ color: "#a78bfa" }}>
                                            ↳ {graph.stats.byKind.inheritance} наследование
                                        </div>
                                    )}
                                    {graph.stats.byKind.reference > 0 && (
                                        <div className="entity-graph-stats__item" style={{ color: "#6366f1" }}>
                                            → {graph.stats.byKind.reference} reference
                                        </div>
                                    )}
                                    {graph.stats.byKind.linkage > 0 && (
                                        <div className="entity-graph-stats__item" style={{ color: "#10b981" }}>
                                            ↔ {graph.stats.byKind.linkage} linkage
                                        </div>
                                    )}
                                    {graph.stats.truncated > 0 && (
                                        <div className="entity-graph-stats__item entity-graph-stats__item--warn">
                                            +{graph.stats.truncated} скрыто (limit {GRAPH_LIMIT})
                                        </div>
                                    )}
                                </div>

                                {/* === TOOLBAR row 1: filters === */}
                                <div className="entity-graph-toolbar entity-graph-toolbar--v2">
                                    <div className="entity-graph-toolbar__row">
                                        <DomainCombobox
                                            value={domainFilter}
                                            onChange={setDomainFilter}
                                            domains={allDomains}
                                            placeholder="Выберите домен…"
                                        />
                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={includeNeighbors}
                                                onChange={(e) => setIncludeNeighbors(e.target.checked)}
                                            />
                                            <span>Соседние домены</span>
                                        </label>

                                        <div className="entity-graph-search">
                                            <MIcon name="search" size="sm" />
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                placeholder="Найти сущность… (/)"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                spellCheck={false}
                                            />
                                            {searchQuery && (
                                                <button className="entity-graph-search__clear" onClick={() => setSearchQuery("")}>
                                                    ✕
                                                </button>
                                            )}
                                            {searchResults.length > 0 && (
                                                <div className="entity-graph-search__dropdown">
                                                    {searchResults.map((n) => (
                                                        <button
                                                            key={n.id}
                                                            className="entity-graph-search__item"
                                                            onClick={() => {
                                                                centerOnNode(n.id);
                                                                setSelectedFqid(n.id);
                                                                setSearchQuery("");
                                                            }}
                                                        >
                                                            <code>{n.entityId}</code>
                                                            <span>{n.domainId}</span>
                                                            {n.isHub && <span className="egn-badge egn-badge--hub">HUB</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="entity-graph-toolbar__spacer" />

                                        <button
                                            className={"btn btn--small" + (pathMode !== "none" || pathResult ? " btn--active" : "")}
                                            onClick={() => (pathMode !== "none" || pathResult ? cancelPath() : startPath())}
                                            title="Найти путь между двумя сущностями"
                                        >
                                            <MIcon name="route" size="sm" />
                                            {pathMode !== "none" || pathResult ? "Отменить путь" : "Найти путь"}
                                        </button>
                                    </div>

                                    {/* === TOOLBAR row 2: display === */}
                                    <div className="entity-graph-toolbar__row">
                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={showInheritance}
                                                onChange={(e) => setShowInheritance(e.target.checked)}
                                            />
                                            <span className="egn-dot" style={{ background: EDGE_COLORS.inheritance }} />
                                            Наследование
                                        </label>
                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={showReferences}
                                                onChange={(e) => setShowReferences(e.target.checked)}
                                            />
                                            <span className="egn-dot" style={{ background: EDGE_COLORS.reference }} />
                                            Reference
                                        </label>
                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={showLinkages}
                                                onChange={(e) => setShowLinkages(e.target.checked)}
                                            />
                                            <span className="egn-dot" style={{ background: EDGE_COLORS.linkage }} />
                                            Linkage
                                        </label>

                                        <div className="entity-graph-toolbar__divider" />

                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={hideOrphans}
                                                onChange={(e) => setHideOrphans(e.target.checked)}
                                            />
                                            <span>Скрыть сирот</span>
                                        </label>

                                        <div className="entity-graph-toolbar__divider" />

                                        <label className="entity-graph-check">
                                            <span>Раскладка:</span>
                                            <select
                                                value={layout}
                                                onChange={(e) => setLayout(e.target.value as Layout)}
                                                className="entity-graph-select"
                                            >
                                                <option value="LR">LR (горизонтально)</option>
                                                <option value="TB">TB (вертикально)</option>
                                                <option value="force">Force</option>
                                            </select>
                                        </label>

                                        <label className="entity-graph-check">
                                            <input
                                                type="checkbox"
                                                checked={showEdgeLabels}
                                                onChange={(e) => setShowEdgeLabels(e.target.checked)}
                                            />
                                            <span>Подписи связей</span>
                                        </label>

                                        <div className="entity-graph-toolbar__spacer" />

                                        <button
                                            className="btn btn--icon btn--small"
                                            onClick={exportPNG}
                                            title="Скачать как PNG"
                                        >
                                            <MIcon name="image" size="sm" />
                                        </button>
                                        <button
                                            className="btn btn--icon btn--small"
                                            onClick={exportClassDiagram}
                                            title="Скачать Mermaid classDiagram"
                                        >
                                            <MIcon name="account_tree" size="sm" />
                                        </button>
                                    </div>
                                </div>

                                {/* === FOCUS BAR === */}
                                {focusFqid && (
                                    <div className="entity-graph-focus-bar">
                                        <MIcon name="center_focus_strong" size="sm" />
                                        <span>Фокус:</span>
                                        <code>{shortEntityId(focusFqid)}</code>
                                        <span className="entity-graph-focus-bar__depth">
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
                                        <button className="entity-graph-focus-bar__close" onClick={clearFocus} title="Снять фокус">
                                            ✕
                                        </button>
                                    </div>
                                )}

                                {/* === PATH BAR === */}
                                {pathMode === "pick-first" && (
                                    <div className="entity-graph-path-bar">
                                        <MIcon name="ads_click" size="sm" />
                                        Кликните <strong>первый узел</strong> пути
                                    </div>
                                )}
                                {pathMode === "pick-second" && pathFrom && (
                                    <div className="entity-graph-path-bar">
                                        <MIcon name="route" size="sm" />
                                        Начало: <code>{shortEntityId(pathFrom)}</code>. Кликните{" "}
                                        <strong>конечный узел</strong>
                                    </div>
                                )}
                                {pathResult && pathFrom && pathTo && (
                                    <div className="entity-graph-path-bar entity-graph-path-bar--found">
                                        <MIcon name="check_circle" size="sm" />
                                        Путь: <code>{shortEntityId(pathFrom)}</code> →{" "}
                                        <code>{shortEntityId(pathTo)}</code>
                                        <span className="entity-graph-path-bar__meta">
                                            {pathResult.nodes.length} узлов · {pathResult.edges.length} связей
                                        </span>
                                        <button className="entity-graph-path-bar__close" onClick={cancelPath}>
                                            ✕
                                        </button>
                                    </div>
                                )}

                                {/* === CANVAS + DETAIL === */}
                                <div className="entity-graph-canvas entity-graph-canvas--with-detail">
                                    <div className="entity-graph-flow">
                                        {graph.nodes.length === 0 ? (
                                            <div className="entity-graph-empty">
                                                <MIcon name="info" size="xl" />
                                                <div className="entity-graph-empty__title">
                                                    {graph.stats.focused
                                                        ? "Окрестность пуста — попробуйте увеличить глубину"
                                                        : hideOrphans
                                                            ? "Все сущности — сироты"
                                                            : "Нет сущностей по текущим фильтрам"}
                                                </div>
                                                {(hideOrphans) && (
                                                    <button className="btn" onClick={() => { setHideOrphans(false); }}>
                                                        Сбросить фильтры
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <ReactFlowProvider>
                                                <EntityGraphInner
                                                    nodes={styledNodes}
                                                    edges={styledEdges}
                                                    onNodeClick={handleNodeClick}
                                                    onNodeMouseEnter={handleNodeHover}
                                                    onNodeMouseLeave={handleNodeLeave}
                                                    onReady={setRfApi}
                                                />
                                            </ReactFlowProvider>
                                        )}
                                    </div>

                                    {selectedFqid && index && (
                                        <EntityDetailPanel
                                            fqid={selectedFqid}
                                            index={index}
                                            onClose={() => setSelectedFqid(null)}
                                            onFocus={() => focusOn(selectedFqid)}
                                            onPath={() => startPath(selectedFqid)}
                                            onOpenCatalog={() => openCatalog(selectedFqid)}
                                            onOpenYaml={() => openYaml(selectedFqid)}
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