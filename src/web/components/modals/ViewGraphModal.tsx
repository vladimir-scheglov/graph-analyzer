import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
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
import { buildViewGraph, type ViewEdgeKind, ViewGraphNode } from "../../lib/model/view-graph";
import { openFileInEditor } from "../../lib/open-file";
import { DomainCombobox } from "../common/DomainCombobox";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 54;

const EDGE_COLORS: Record<ViewEdgeKind, string> = {
    action: "#f59e0b",
    tabs: "#10b981",
    nested: "#a78bfa",
    menu: "#6366f1",
    dashboard: "#06b6d4",
    mixin: "#ec4899",
};

interface FlowNodeData {
    node: ViewGraphNode;
}

function ViewFlowNode({ data }: { data: FlowNodeData }) {
    const { node } = data;
    const cls = ["view-graph-node", `view-graph-node--${node.type}`];
    if (node.isMixin) cls.push("view-graph-node--mixin");
    if (node.isOrphan) cls.push("view-graph-node--orphan");
    if (node.unresolved) cls.push("view-graph-node--unresolved");
    return (
        <>
            <Handle type="target" position={Position.Left} className="view-graph-handle" />
            <div className={cls.join(" ")}>
                <div className="view-graph-node__id">{node.viewId}</div>
                <div className="view-graph-node__meta">
                    {node.type}
                    {node.entity && <span> · {String(node.entity).split("/").pop()}</span>}
                </div>
            </div>
            <Handle type="source" position={Position.Right} className="view-graph-handle" />
        </>
    );
}

const nodeTypes: NodeTypes = { viewNode: ViewFlowNode as any };

function layoutGraph(nodes: any[], edges: any[]): any[] {
    if (nodes.length === 0) return nodes;
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90, marginx: 40, marginy: 40 });
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

function GraphInner({ nodes, edges, onNodeClick }: { nodes: any[]; edges: any[]; onNodeClick: (n: any) => void }) {
    const rf = useReactFlow();
    useEffect(() => {
        if (nodes.length === 0) return;
        const t = setTimeout(() => { try { rf.fitView({ duration: 400, padding: 0.15 }); } catch { } }, 120);
        return () => clearTimeout(t);
    }, [nodes.length, edges.length, rf]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => onNodeClick(n)}
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
                nodeColor={(n: any) => {
                    const t = n.data?.node?.type;
                    if (t === "entity") return "#6366f1";
                    if (t === "list") return "#10b981";
                    if (t === "panel") return "#a78bfa";
                    if (t === "modal") return "#f59e0b";
                    if (t === "page") return "#ec4899";
                    return "#64748b";
                }}
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 160, height: 120 }}
            />
        </ReactFlow>
    );
}

export function ViewGraphModal() {
    const open = useGraphStore((s) => s.viewGraphOpen);
    const setOpen = useGraphStore((s) => s.setViewGraphOpen);
    const { index, loading, error } = useModelIndex();

    const prefill = useGraphStore((s) => s.viewGraphPrefillDomain);
    const setPrefill = useGraphStore((s) => s.setViewGraphPrefillDomain);

    const [domainFilter, setDomainFilter] = useState("");

    useEffect(() => {
        if (!open) return;
        if (prefill) {
            setDomainFilter(prefill);
            setPrefill(null);
        }
    }, [open, prefill, setPrefill]);
    const [includeNested, setIncludeNested] = useState(true);
    const [includeMixins, setIncludeMixins] = useState(true);
    const [includeDash, setIncludeDash] = useState(true);
    const [selectedNode, setSelectedNode] = useState<ViewGraphNode | null>(null);

    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        index.domains.forEach((d) => {
            if (!map.has(d.id)) map.set(d.id, 0);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    useEffect(() => {
        if (!open) {
            setDomainFilter("");
            setSelectedNode(null);
        }
    }, [open]);

    const graph = useMemo(() => {
        if (!index) return null;
        return buildViewGraph(index, {
            domainFilter: domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined,
            // «Все домены» — показываем только междоменные связи
            crossDomainOnly: !domainFilter,
            includeNested,
            includeMixins,
            includeDashboards: includeDash,
        });
    }, [index, domainFilter, includeNested, includeMixins, includeDash]);

    const flowNodes = useMemo(() => {
        if (!graph) return [];
        return graph.nodes.map((n) => ({
            id: n.id,
            type: "viewNode",
            position: { x: 0, y: 0 },
            data: { node: n },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        }));
    }, [graph]);

    const flowEdges = useMemo(() => {
        if (!graph) return [];
        return graph.edges.map((e) => {
            const stroke = EDGE_COLORS[e.kind];
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: "smoothstep",
                label: e.label,
                animated: e.kind === "action",
                data: { kind: e.kind, detail: e.detail },
                style: {
                    stroke,
                    strokeWidth: e.kind === "action" ? 2 : 1.5,
                    strokeDasharray: e.kind === "mixin" || e.kind === "dashboard" ? "5 3" : undefined,
                    opacity: 0.8,
                },
                markerEnd: { type: "arrowclosed" as any, color: stroke, width: 14, height: 14 },
            };
        });
    }, [graph]);

    const laidNodes = useMemo(() => layoutGraph(flowNodes, flowEdges), [flowNodes, flowEdges]);

    const onNodeClick = useCallback((n: any) => {
        setSelectedNode(n?.data?.node || null);
    }, []);

    if (!open) return null;

    const jumpToView = (domainId: string, viewId: string) => {
        const nodes = useGraphStore.getState().nodes;
        const node = nodes.find((x) => (x.data.domainId || "").toLowerCase() === domainId.toLowerCase());
        if (!node?.data.filePath) {
            useGraphStore.getState().showSnackbar("Файл схемы не найден");
            return;
        }
        const st = useGraphStore.getState();
        st.setYamlViewerPendingGoto({ kind: "fqid", fqid: `${domainId}/${viewId}` });
        st.setYamlViewerFilePath(node.data.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(domainId);
        st.setYamlViewerOpen(true);
        setOpen(false);
    };

    return (
        <div className="help-overlay help-overlay--fullscreen" style={{ zIndex: 450 }} onMouseDown={() => setOpen(false)}>
            <div className="help-modal view-graph-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="schema" size="sm" />
                        <span className="icon-label">Граф зависимостей представлений</span>
                        {graph && (
                            <span className="help-modal__badge">
                                {graph.stats.totalNodes} узлов · {graph.stats.totalEdges} связей
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                </div>

                {loading && <div className="help-modal__body"><div className="help-modal__loading">Загрузка индекса…</div></div>}
                {error && <div className="help-modal__body"><div style={{ color: "var(--danger)" }}>Ошибка: {error}</div></div>}

                {index && graph && (
                    <div className="view-graph-body">
                        <div className="view-graph-toolbar">
                            <div className="view-graph-toolbar__domain">
                                <span className="view-graph-toolbar__label">Домен:</span>
                                <DomainCombobox
                                    value={domainFilter}
                                    onChange={(v) => setDomainFilter(v)}
                                    domains={allDomains}
                                    placeholder="Все домены"
                                    allowEmpty
                                    emptyLabel="Все домены (только междоменные)"
                                />
                            </div>
                            <label className="entity-graph-toggle">
                                <input type="checkbox" checked={includeNested} onChange={() => setIncludeNested(!includeNested)} />
                                <span className="entity-graph-legend-dot" style={{ background: EDGE_COLORS.nested }} />
                                Nested
                            </label>
                            <label className="entity-graph-toggle">
                                <input type="checkbox" checked={includeMixins} onChange={() => setIncludeMixins(!includeMixins)} />
                                <span className="entity-graph-legend-dot" style={{ background: EDGE_COLORS.mixin }} />
                                Mixins
                            </label>
                            <label className="entity-graph-toggle">
                                <input type="checkbox" checked={includeDash} onChange={() => setIncludeDash(!includeDash)} />
                                <span className="entity-graph-legend-dot" style={{ background: EDGE_COLORS.dashboard }} />
                                Dashboard
                            </label>
                            <div className="view-graph-toolbar__stats">
                                {graph.stats.orphans > 0 && <span title="Нет ни входящих, ни исходящих">👻 {graph.stats.orphans} orphaned</span>}
                                {graph.stats.unresolved > 0 && <span title="Ссылается на несуществующую сущность">⚠ {graph.stats.unresolved} unresolved</span>}
                            </div>
                        </div>

                        <div className="view-graph-canvas">
                            {graph.nodes.length === 0 ? (
                                <div className="view-graph-empty">
                                    <MIcon name={!domainFilter ? "link_off" : "info"} size="xl" />
                                    {!domainFilter ? (
                                        <>
                                            <div className="view-graph-empty__title">
                                                Нет междоменных связей
                                            </div>
                                            <div className="view-graph-empty__hint">
                                                В режиме «все домены» показываются только связи между views
                                                из разных доменов. Выберите конкретный домен, чтобы увидеть
                                                его внутренние views.
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="view-graph-empty__title">В домене нет views</div>
                                            <div className="view-graph-empty__hint">
                                                Сгенерируйте views (CRUD / Справочник) или создайте вручную.
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <ReactFlowProvider>
                                    <GraphInner nodes={laidNodes} edges={flowEdges} onNodeClick={onNodeClick} />
                                </ReactFlowProvider>
                            )}
                        </div>

                        {selectedNode && (
                            <div className="view-graph-inspector">
                                <div className="view-graph-inspector__head">
                                    <code>{selectedNode.domainId}/{selectedNode.viewId}</code>
                                    <span className="view-graph-inspector__type">{selectedNode.type}</span>
                                    <button className="view-graph-inspector__close" onClick={() => setSelectedNode(null)}>✕</button>
                                </div>
                                {selectedNode.label && <div className="view-graph-inspector__label">{selectedNode.label}</div>}
                                {selectedNode.entity && <div className="view-graph-inspector__meta">entity: <code>{selectedNode.entity}</code></div>}
                                <div className="view-graph-inspector__actions">
                                    <button className="btn btn--primary" onClick={() => jumpToView(selectedNode.domainId, selectedNode.viewId)}>
                                        <MIcon name="open_in_new" size="sm" /> Открыть в YAML
                                    </button>
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            const st = useGraphStore.getState();
                                            st.setDomainSchemaDomainId(selectedNode.domainId);
                                            st.setDomainSchemaPrefillQuery(selectedNode.viewId);
                                            st.setDomainSchemaPrefillExpandItem(`view:${selectedNode.viewId}`);
                                            st.setDomainSchemaOpen(true);
                                            setOpen(false);
                                        }}
                                    >
                                        <MIcon name="menu_book" size="sm" /> В схеме домена
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}