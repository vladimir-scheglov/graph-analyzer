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
import type { DataTypeRecord } from "../../../shared/model-types";

// ============ Custom node ============

interface WorkflowNodeData {
    statusId: string;
    name?: string;
    color?: string;
    isInitial: boolean;
    isFinal: boolean;
    isHidden: boolean;
    isWildcard: boolean;
}

function WorkflowStatusNode({ data }: { data: WorkflowNodeData }) {
    const cls = ["workflow-node"];
    if (data.isInitial) cls.push("workflow-node--initial");
    if (data.isFinal) cls.push("workflow-node--final");
    if (data.isHidden) cls.push("workflow-node--hidden");
    if (data.isWildcard) cls.push("workflow-node--wildcard");

    const style: React.CSSProperties = {};
    if (data.color) style.borderLeftColor = data.color;

    return (
        <>
            <Handle type="target" position={Position.Left} className="workflow-handle" />
            <div className={cls.join(" ")} style={style}>
                <div className="workflow-node__id">
                    {data.isInitial && (
                        <MIcon name="play_circle" size="sm" title="Начальный статус" />
                    )}
                    {data.isFinal && (
                        <MIcon name="check_circle" size="sm" title="Конечный статус" />
                    )}
                    {data.isWildcard ? (
                        <span className="workflow-node__wildcard">*</span>
                    ) : (
                        <span>{data.statusId}</span>
                    )}
                </div>
                {data.name && data.name !== data.statusId && (
                    <div className="workflow-node__name">{data.name}</div>
                )}
            </div>
            <Handle type="source" position={Position.Right} className="workflow-handle" />
        </>
    );
}

const nodeTypes: NodeTypes = { workflowNode: WorkflowStatusNode as any };

// ============ Layout ============

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;

function layoutGraph(
    nodes: any[],
    edges: any[],
    rankdir: "LR" | "TB",
): any[] {
    if (nodes.length === 0) return nodes;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir,
        nodesep: 24,
        ranksep: 80,
        marginx: 30,
        marginy: 30,
    });

    const ids = new Set(nodes.map((n) => n.id));
    nodes.forEach((n) =>
        g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
    );
    edges.forEach((e) => {
        if (ids.has(e.source) && ids.has(e.target)) {
            g.setEdge(e.source, e.target);
        }
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

// ============ Build graph from DataTypeRecord ============

interface BuiltGraph {
    nodes: any[];
    edges: any[];
    wildcardUsed: boolean;
    statusCount: number;
    transitionCount: number;
}

function buildWorkflowGraph(
    dt: DataTypeRecord,
    rankdir: "LR" | "TB",
): BuiltGraph {
    const statuses = dt.statuses || [];
    const transitions = dt.transitions || [];
    const colorByStatus = new Map<string, string>();
    (dt.workflowView || []).forEach((v) => {
        if (v.status && v.color) colorByStatus.set(v.status, v.color);
    });

    const initial = dt.initial || null;
    const finals = new Set(dt.finals || []);

    const wildcardUsed =
        transitions.some((t) => t.from === "*") ||
        transitions.some((t) => t.to === "*");

    const nodes: any[] = statuses.map((s) => ({
        id: `status:${s}`,
        type: "workflowNode",
        position: { x: 0, y: 0 },
        data: {
            statusId: s,
            color: colorByStatus.get(s),
            isInitial: s === initial,
            isFinal: finals.has(s),
            isHidden: false,
            isWildcard: false,
        } as WorkflowNodeData,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
    }));

    if (wildcardUsed) {
        nodes.push({
            id: "status:*",
            type: "workflowNode",
            position: { x: 0, y: 0 },
            data: {
                statusId: "*",
                name: "любой статус",
                isInitial: false,
                isFinal: false,
                isHidden: false,
                isWildcard: true,
            } as WorkflowNodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        });
    }

    // Рёбра: каждое (from, to) — одно ребро. Кратные (from,to)
    // (одинаковые пары) — не встречаются по спецификации, но
    // на всякий случай дедуплицируем.
    const seen = new Set<string>();
    const edges: any[] = [];
    transitions.forEach((t, idx) => {
        if (!t.from || !t.to) return;
        const key = `${t.from}->${t.to}`;
        if (seen.has(key)) return;
        seen.add(key);

        const source = `status:${t.from}`;
        const target = `status:${t.to}`;
        if (!nodes.find((n) => n.id === source)) return;
        if (!nodes.find((n) => n.id === target)) return;

        const isAny = t.from === "*" || t.to === "*";
        const stroke = isAny ? "#f59e0b" : "var(--accent)";

        edges.push({
            id: `tr:${idx}:${t.from}:${t.to}`,
            source,
            target,
            type: "smoothstep",
            animated: false,
            markerEnd: {
                type: "arrowclosed" as any,
                color: stroke,
                width: 16,
                height: 16,
            },
            style: {
                stroke,
                strokeWidth: isAny ? 1.5 : 2,
                strokeDasharray: isAny ? "6 4" : undefined,
                opacity: 0.85,
            },
        });
    });

    return {
        nodes: layoutGraph(nodes, edges, rankdir),
        edges,
        wildcardUsed,
        statusCount: statuses.length,
        transitionCount: transitions.length,
    };
}

// ============ Inner (для useReactFlow) ============

function WorkflowGraphInner({ nodes, edges }: { nodes: any[]; edges: any[] }) {
    const rf = useReactFlow();

    useEffect(() => {
        if (nodes.length === 0) return;
        const t = setTimeout(() => {
            try {
                rf.fitView({ duration: 400, padding: 0.2 });
            } catch { /* ignore */ }
        }, 120);
        return () => clearTimeout(t);
    }, [nodes.length, edges.length, rf]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
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
                nodeColor={(n: any) =>
                    n.data?.color || (n.data?.isWildcard ? "#f59e0b" : "#6366f1")
                }
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 160, height: 120 }}
            />
        </ReactFlow>
    );
}

// ============ Modal ============

export function WorkflowGraphModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const [rankdir, setRankdir] = useState<"LR" | "TB">("LR");

    const target = store.workflowGraphTarget;
    const open = !!target;

    const dt = useMemo(() => {
        if (!index || !target) return null;
        return (
            index.dataTypes.find(
                (d) => d.id === target.dataTypeId && d.domainId === target.domainId,
            ) || null
        );
    }, [index, target]);

    const graph = useMemo(() => {
        if (!dt || dt.kind !== "Workflow") return null;
        return buildWorkflowGraph(dt, rankdir);
    }, [dt, rankdir]);

    // Сброс состояния рендера при смене dataType
    useEffect(() => {
        if (open) setRankdir("LR");
    }, [target?.domainId, target?.dataTypeId]);

    const close = useCallback(
        () => useGraphStore.getState().setWorkflowGraphTarget(null),
        [],
    );

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close();
            }
        };
        document.addEventListener("keydown", onEsc, true);
        return () => document.removeEventListener("keydown", onEsc, true);
    }, [open, close]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 520 }}
            onMouseDown={close}
        >
            <div
                className="help-modal workflow-graph-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="conversion_path" size="sm" />
                        <span className="icon-label">Граф переходов</span>
                        {dt && (
                            <span className="help-modal__badge">{dt.id}</span>
                        )}
                        {dt && dt.name !== dt.id && (
                            <span
                                style={{
                                    color: "var(--text-500)",
                                    fontSize: 12,
                                    fontWeight: 400,
                                    marginLeft: 4,
                                }}
                            >
                                {dt.name}
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={close}>
                        ✕
                    </button>
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

                {!loading && !error && !dt && (
                    <div className="help-modal__body">
                        <div className="workflow-graph-empty">
                            Workflow не найден в индексе (домен {target?.domainId} /
                            тип {target?.dataTypeId})
                        </div>
                    </div>
                )}

                {dt && dt.kind !== "Workflow" && (
                    <div className="help-modal__body">
                        <div className="workflow-graph-empty">
                            Тип «{dt.id}» не является Workflow (kind: {dt.kind})
                        </div>
                    </div>
                )}

                {dt && dt.kind === "Workflow" && graph && (
                    <>
                        <div className="workflow-graph-toolbar">
                            <div className="workflow-graph-toolbar__left">
                                <span className="workflow-graph-stat">
                                    <strong>{graph.statusCount}</strong> статусов
                                </span>
                                <span className="workflow-graph-stat">
                                    <strong>{graph.transitionCount}</strong> переходов
                                </span>
                                {dt.initial && (
                                    <span className="workflow-graph-stat workflow-graph-stat--initial">
                                        <MIcon name="play_circle" size="sm" />
                                        начальный: <code>{dt.initial}</code>
                                    </span>
                                )}
                                {dt.finals && dt.finals.length > 0 && (
                                    <span className="workflow-graph-stat workflow-graph-stat--final">
                                        <MIcon name="check_circle" size="sm" />
                                        финальных: <strong>{dt.finals.length}</strong>
                                    </span>
                                )}
                            </div>
                            <div className="workflow-graph-toolbar__right">
                                <label className="entity-matrix-filter">
                                    <span>Ориентация:</span>
                                    <select
                                        value={rankdir}
                                        onChange={(e) =>
                                            setRankdir(e.target.value as "LR" | "TB")
                                        }
                                    >
                                        <option value="LR">Горизонтальная</option>
                                        <option value="TB">Вертикальная</option>
                                    </select>
                                </label>
                            </div>
                        </div>

                        <div className="workflow-graph-canvas">
                            {graph.nodes.length === 0 ? (
                                <div className="workflow-graph-empty">
                                    У workflow не заданы статусы
                                </div>
                            ) : graph.edges.length === 0 ? (
                                <div className="workflow-graph-empty">
                                    У workflow не заданы переходы
                                </div>
                            ) : (
                                <ReactFlowProvider>
                                    <WorkflowGraphInner
                                        nodes={graph.nodes}
                                        edges={graph.edges}
                                    />
                                </ReactFlowProvider>
                            )}
                        </div>

                        {dt.description && (
                            <div className="workflow-graph-description">
                                {dt.description}
                            </div>
                        )}

                        <div className="workflow-graph-legend">
                            <span className="workflow-graph-legend__item">
                                <span className="workflow-graph-legend__dot workflow-graph-legend__dot--initial" />
                                начальный
                            </span>
                            <span className="workflow-graph-legend__item">
                                <span className="workflow-graph-legend__dot workflow-graph-legend__dot--final" />
                                конечный
                            </span>
                            <span className="workflow-graph-legend__item">
                                <span className="workflow-graph-legend__dot" />
                                обычный
                            </span>
                            {graph.wildcardUsed && (
                                <span className="workflow-graph-legend__item">
                                    <span className="workflow-graph-legend__dot workflow-graph-legend__dot--wildcard">
                                        *
                                    </span>
                                    переход из/в любой статус
                                </span>
                            )}
                            {dt.workflowView && dt.workflowView.some((v) => v.color) && (
                                <span className="workflow-graph-legend__item">
                                    <MIcon name="palette" size="sm" />
                                    цвет статуса — из workflowView
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}