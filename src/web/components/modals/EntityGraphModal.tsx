import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    BaseEdge,
    Controls,
    EdgeProps,
    getSmoothStepPath,
    Handle,
    MiniMap,
    Position,
    ReactFlowProvider,
    useReactFlow,
    NodeTypes,
    EdgeTypes
} from 'reactflow';
import dagre from 'dagre';

import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { buildEntityGraph, EntityEdgeKind } from '../../lib/model/entity-graph';
import { DomainCombobox } from '../common/DomainCombobox';
import { MIcon } from '../common';
import { ModalHelp, HelpSection, HelpText, HelpList, HelpButton } from '../common/ModalHelp';
import { downloadEntityClassDiagram } from '../../lib/export';

const GRAPH_LIMIT = 200;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 46;

// ============ Custom node С Handle ============

function EntityNode({ data }: { data: any }) {
    const domainHue = data.__domainHue ?? 220;
    return (
        <>
            <Handle
                type="target"
                position={Position.Top}
                className="entity-node-handle"
            />
            <div
                className="entity-graph-node-card"
                style={{ borderLeftColor: `hsl(${domainHue}, 60%, 55%)` }}
                title={`${data.entityId}\n${data.domainId}\n${data.attributeCount} атрибутов`}
            >
                <div className="entity-graph-node-card__id">{data.entityId}</div>
                <div className="entity-graph-node-card__domain">{data.domainId}</div>
            </div>
            <Handle
                type="source"
                position={Position.Bottom}
                className="entity-node-handle"
            />
        </>
    );
}

const nodeTypes: NodeTypes = { entityNode: EntityNode as any };

// ============ Layout ============

function layoutGraph(
    nodes: any[],
    edges: any[],
    rankdir: 'LR' | 'TB'
): any[] {
    if (nodes.length === 0) return nodes;

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir,
        nodesep: 30,
        ranksep: 80,
        marginx: 40,
        marginy: 40
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));

    // Только рёбра между существующими узлами, иначе dagre создаст фиктивные
    edges.forEach((e) => {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            g.setEdge(e.source, e.target);
        }
    });

    dagre.layout(g);

    return nodes.map((n) => {
        const pos = g.node(n.id);
        if (!pos) return { ...n, position: { x: 0, y: 0 } };
        return {
            ...n,
            position: {
                x: pos.x - NODE_WIDTH / 2,
                y: pos.y - NODE_HEIGHT / 2
            }
        };
    });
}

function hueForDomain(domainId: string): number {
    let hash = 0;
    for (let i = 0; i < domainId.length; i++) {
        hash = (hash * 31 + domainId.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 360;
}

// ============ Inner ============

interface InnerProps {
    nodes: any[];
    edges: any[];
    sourcePosition: 'left' | 'right' | 'top' | 'bottom';
    targetPosition: 'left' | 'right' | 'top' | 'bottom';
    onNodeClick: (fqid: string) => void;
}

function EntityGraphInner({
    nodes,
    edges,
    sourcePosition,
    targetPosition,
    onNodeClick
}: InnerProps) {
    const rf = useReactFlow();

    const positionedNodes = useMemo(
        () => nodes.map((n) => ({ ...n, sourcePosition, targetPosition })),
        [nodes, sourcePosition, targetPosition]
    );

    useEffect(() => {
        if (nodes.length === 0) return;
        const t = setTimeout(() => {
            try {
                rf.fitView({ duration: 400, padding: 0.15 });
            } catch { }
        }, 120);
        return () => clearTimeout(t);
    }, [nodes.length, edges.length, rf]);

    return (
        <ReactFlow
            nodes={positionedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => onNodeClick(node.id)}
            fitView
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements={false}
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

// ============ Main modal ============

export function EntityGraphModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);

    const open = store.entityGraphOpen;

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        // Сортируем по количеству сущностей — самые крупные сверху
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // Автовыбор первого домена при открытии, если ничего не выбрано
    useEffect(() => {
        if (!open) return;
        if (!index) return;
        if (store.entityGraphDomainFilter) return;
        if (allDomains.length === 0) return;
        store.setEntityGraphDomainFilter(allDomains[0][0]);
    }, [open, index, allDomains, store]);

    const domainFilter = store.entityGraphDomainFilter;
    const rankdir = store.entityGraphRankdir;
    const showInheritance = store.entityGraphShowInheritance;
    const showReferences = store.entityGraphShowReferences;
    const showLinkages = store.entityGraphShowLinkages;

    const graph = useMemo(() => {
        if (!index || !domainFilter) return null;
        const domains = new Set([domainFilter.toLowerCase()]);
        return buildEntityGraph(index, {
            domains,
            showInheritance,
            showReferences,
            showLinkages,
            limit: GRAPH_LIMIT
        });
    }, [index, domainFilter, showInheritance, showReferences, showLinkages]);

    const rfNodes = useMemo(() => {
        if (!graph) return [];
        return graph.nodes.map((n) => ({
            id: n.id,
            type: 'entityNode',
            position: { x: 0, y: 0 },
            data: {
                entityId: n.entityId,
                domainId: n.domainId,
                attributeCount: n.entity.attributes.length,
                __domainHue: hueForDomain(n.domainId)
            },
            width: NODE_WIDTH,
            height: NODE_HEIGHT
        }));
    }, [graph]);

    const rfEdges = useMemo(() => {
        if (!graph) return [];
        return graph.edges.map((e) => {
            const stroke =
                e.kind === 'inheritance' ? '#a78bfa' :
                    e.kind === 'reference' ? '#6366f1' :
                        '#10b981';
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'entityEdge',
                data: {
                    kind: e.kind,
                    label: e.label,
                    viaAttribute: e.viaAttribute,
                    linkageId: e.linkageId,
                    title: e.title || e.label || ''
                },
                style: {
                    stroke,
                    strokeWidth: e.kind === 'inheritance' ? 2.5 : 1.5,
                    strokeDasharray: e.kind === 'reference' ? '5 3' : undefined,
                    opacity: 0.85
                },
                markerEnd: {
                    type: 'arrowclosed' as any,
                    color: stroke,
                    width: 12,
                    height: 12
                }
            };
        });
    }, [graph]);

    const laidNodes = useMemo(
        () => layoutGraph(rfNodes, rfEdges, rankdir),
        [rfNodes, rfEdges, rankdir]
    );

    const handleNodeClick = useCallback(
        (fqid: string) => {
            // НЕ закрываем граф — каталог откроется поверх, при закрытии вернёмся в граф.
            store.setEntityCatalogInitialFqid(fqid);
            store.setEntityCatalogOpen(true);
        },
        [store]
    );

    const handleExportClassDiagram = useCallback(() => {
        if (!graph) return;

        downloadEntityClassDiagram(
            graph,
            {
                includeStereotype: true,
                maxAttributes: 30,
            },
            domainFilter || 'all'
        );

        store.showSnackbar(
            `ClassDiagram: ${graph.nodes.length} классов`
        );
    }, [graph, domainFilter, store]);

    if (!open) return null;

    const sourcePosition: 'left' | 'right' | 'top' | 'bottom' =
        rankdir === 'LR' ? 'right' : 'bottom';
    const targetPosition: 'left' | 'right' | 'top' | 'bottom' =
        rankdir === 'LR' ? 'left' : 'top';

    const domainCount = allDomains.find(([d]) => d === domainFilter)?.[1] ?? 0;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 400 }}
            onMouseDown={() => store.setEntityGraphOpen(false)}
        >
            <div
                className="help-modal entity-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="hub" size="sm" /> <span className='icon-label'>Граф сущностей</span>
                        {graph && (<span className="help-modal__badge">{graph.stats.totalNodes} узлов · {graph.edges.length} связей</span>)}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Как читать?" />
                        <button
                            className="help-modal__close"
                            onClick={() => store.setEntityGraphOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && graph && (
                    <div className="entity-graph-modal-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Промежуточный уровень визуализации между графом доменов и матрицей:
                                    здесь узлы — <strong>сущности</strong>, а рёбра — три типа связей между ними.
                                    Полезно для оценки плотности и «кластеров» в отдельном домене.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Цвета рёбер">
                                <HelpList>
                                    <li><strong style={{ color: '#a78bfa' }}>Фиолетовые толстые</strong> — наследование. Стрелка идёт от родителя к наследнику.</li>
                                    <li><strong style={{ color: '#6366f1' }}>Синие пунктирные</strong> — Reference-атрибут (одна сущность ссылается на другую).</li>
                                    <li><strong style={{ color: '#10b981' }}>Зелёные сплошные</strong> — linkage (объявленная связь между сущностями).</li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Цвет полосы слева">
                                <HelpText>
                                    Полоса слева у каждого узла кодирует <strong>домен</strong>, к которому
                                    относится сущность. Все сущности из одного домена — одного оттенка.
                                    Легко увидеть «кластеры» и «мосты» между доменами.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Что важно">
                                <HelpText>
                                    Граф ограничен одним доменом — так избегаем каши из сотен сущностей.
                                    Переключайте домен через селект сверху. Разные типы рёбер можно
                                    скрывать чекбоксами, чтобы сфокусироваться на одном виде связи.
                                </HelpText>
                            </HelpSection>
                        </ModalHelp>
                        <div className="entity-graph-toolbar">
                            <div className="entity-graph-toolbar__filters">
                                <DomainCombobox
                                    value={domainFilter}
                                    onChange={store.setEntityGraphDomainFilter}
                                    domains={allDomains}
                                    placeholder="Выберите домен..."
                                />

                                <button
                                    className="btn"
                                    onClick={handleExportClassDiagram}
                                    disabled={!graph || graph.nodes.length === 0}
                                    title={
                                        graph && graph.nodes.length > 0
                                            ? `Скачать Mermaid classDiagram (${graph.nodes.length} классов)`
                                            : 'Сначала выберите домен с сущностями'
                                    }
                                >
                                    <MIcon name="account_tree" size="sm" />
                                    <span style={{ marginLeft: 6 }}>
                                        Экспорт classDiagram
                                    </span>
                                </button>

                                {domainFilter && (
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            store.setDomainSchemaDomainId(domainFilter);
                                            store.setDomainSchemaOpen(true);
                                        }}
                                        title="Открыть структуру схемы выбранного домена"
                                    >
                                        <MIcon name="description" size="sm" />
                                        <span style={{ marginLeft: 6 }}>Схема домена</span>
                                    </button>
                                )}

                                <label className="entity-matrix-filter">
                                    <span>Ориентация:</span>
                                    <select
                                        value={rankdir}
                                        onChange={(e) =>
                                            store.setEntityGraphRankdir(e.target.value as 'LR' | 'TB')
                                        }
                                    >
                                        <option value="LR">Горизонтальная</option>
                                        <option value="TB">Вертикальная</option>
                                    </select>
                                </label>
                            </div>

                            <div className="entity-graph-toolbar__toggles">
                                <label className="entity-graph-toggle">
                                    <input
                                        type="checkbox"
                                        checked={showInheritance}
                                        onChange={() =>
                                            store.setEntityGraphShowInheritance(!showInheritance)
                                        }
                                    />
                                    <span className="entity-graph-legend-dot" style={{ background: '#a78bfa' }} />
                                    Наследование ({graph.stats.byKind.inheritance})
                                </label>
                                <label className="entity-graph-toggle">
                                    <input
                                        type="checkbox"
                                        checked={showReferences}
                                        onChange={() =>
                                            store.setEntityGraphShowReferences(!showReferences)
                                        }
                                    />
                                    <span className="entity-graph-legend-dot" style={{ background: '#6366f1' }} />
                                    Ссылки ({graph.stats.byKind.reference})
                                </label>
                                <label className="entity-graph-toggle">
                                    <input
                                        type="checkbox"
                                        checked={showLinkages}
                                        onChange={() =>
                                            store.setEntityGraphShowLinkages(!showLinkages)
                                        }
                                    />
                                    <span className="entity-graph-legend-dot" style={{ background: '#10b981' }} />
                                    Linkages ({graph.stats.byKind.linkage})
                                </label>
                            </div>

                            {graph.stats.truncated > 0 && (
                                <div className="entity-graph-hint">
                                    Показано топ-{GRAPH_LIMIT} из {GRAPH_LIMIT + graph.stats.truncated} сущностей
                                </div>
                            )}
                        </div>

                        <div className="entity-graph-canvas">
                            {graph.nodes.length === 0 ? (
                                <div className="entity-matrix-empty">
                                    {domainCount === 0
                                        ? 'В выбранном домене нет сущностей'
                                        : 'Нет сущностей для отображения'}
                                </div>
                            ) : (
                                <ReactFlowProvider>
                                    <EntityGraphInner
                                        nodes={laidNodes}
                                        edges={rfEdges}
                                        sourcePosition={sourcePosition}
                                        targetPosition={targetPosition}
                                        onNodeClick={handleNodeClick}
                                    />
                                </ReactFlowProvider>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

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
    data
}: EdgeProps) {
    const [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8
    });

    const title = (data && (data as any).title) || '';
    const kind = (data && (data as any).kind) || 'reference';

    return (
        <>
            {/* Видимый путь */}
            <BaseEdge
                id={id}
                path={edgePath}
                style={style}
                markerEnd={markerEnd}
            />

            {/* Невидимая толстая полоса поверх — ловит hover и показывает title */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: 'pointer' }}
            >
                <title>{title}</title>
            </path>
        </>
    );
}

const edgeTypes: EdgeTypes = {
    entityEdge: EntityEdge as any
};