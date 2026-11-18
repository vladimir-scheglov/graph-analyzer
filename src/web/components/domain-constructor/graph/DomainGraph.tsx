import {
    useCallback, useEffect, useMemo, useRef, useState, type FC,
} from 'react';
import ReactFlow, {
    Background, Controls, MiniMap, MarkerType,
    ReactFlowProvider, useReactFlow,
    type Node, type Edge, type Connection,
} from 'reactflow';

import { useEditorStore } from '../store/editor-store';
import { buildGraph } from './graph-builder';
import { layoutGraph } from './layout';
import { EntityNode } from './EntityNode';
import { LinkageEdge } from './LinkageEdge';
import { InheritanceEdge } from './InheritanceEdge';
import { GraphToolbar } from './GraphToolbar';
import { AddLinkageModal } from '../sections/linkages/AddLinkageModal';
import type { GraphFilterOptions, GraphLayer } from './types';
import { MixinEdge } from './MixinEdge';
import { TransitiveEdge } from './TransitiveEdge';

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = {
    linkage: LinkageEdge,
    inheritance: InheritanceEdge,
    mixin: MixinEdge,
    transitive: TransitiveEdge,
};

const ALL_LAYERS: GraphLayer[] = ['linkages', 'inheritance', 'mixins', 'transitive'];
const ALL_LINKAGE_TYPES = ['1_1', '1_n', 'n_n'];

const DomainGraphInner2: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const select = useEditorStore((s) => s.select);
    const setActiveTab = useEditorStore((s) => s.setActiveTab);

    const currentDomainId = schema.metadata.id.toLowerCase();

    const [filter, setFilter] = useState<GraphFilterOptions>({
        layers: new Set<GraphLayer>(ALL_LAYERS),
        search: '',
        linkageTypes: new Set<string>(ALL_LINKAGE_TYPES),
    });

    const [pendingConnection, setPendingConnection] = useState<{
        sourceFqid: string;
        targetFqid: string;
    } | null>(null);

    // ============ Build + layout ============
    const { nodes, edges } = useMemo(() => {
        const built = buildGraph(schema, modelIndex, filter);
        const { positions } = layoutGraph(built.nodes, built.edges, 'LR');

        const rfNodes: Node[] = built.nodes.map((n) => ({
            id: n.id,
            type: 'entity',
            position: positions[n.id] ?? { x: 0, y: 0 },
            data: n.data,
        }));

        const rfEdges: Edge[] = built.edges.map((e) => {
            const isUndirected =
                e.data.kind === 'linkage' && (e.data as any).undirected;
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type:
                    e.kind === 'linkages'
                        ? 'linkage'
                        : e.kind === 'inheritance'
                            ? 'inheritance'
                            : e.kind === 'mixins'
                                ? 'mixin'
                                : 'transitive',
                data: e.data,
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    width: 14,
                    height: 14,
                    color:
                        e.kind === 'inheritance'
                            ? 'var(--accent)'
                            : e.kind === 'mixins'
                                ? 'var(--success)'
                                : 'var(--border-hover)',
                },
                markerStart: isUndirected
                    ? {
                        type: MarkerType.ArrowClosed,
                        width: 14,
                        height: 14,
                        color: 'var(--border-hover)',
                    }
                    : undefined,
            };
        });

        return { nodes: rfNodes, edges: rfEdges };
    }, [schema, modelIndex, filter]);

    // ============ Клик по узлу → навигация ============
    const handleNodeClick = useCallback(
        (_: any, node: Node) => {
            const entityId = node.data.entityId as string;
            select(`entity:${entityId}`);
            setActiveTab('entities');
        },
        [select, setActiveTab],
    );

    // ============ Drag-to-create-link ============
    const handleConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target) return;
        if (connection.source === connection.target) return;
        setPendingConnection({
            sourceFqid: connection.source,
            targetFqid: connection.target,
        });
    }, []);

    /**
     * Конвертирует FQID узла в значение для поля side1/side2:
     *  - текущий домен → оригинальный entityId (Incident, не incident)
     *  - чужой домен → FQID (other.domain/Entity)
     */
    const fqidToSideRef = useCallback(
        (fqid: string): string => {
            const node = nodes.find((n) => n.id === fqid);
            if (!node) return fqid;
            const domain = fqid.split('/')[0] ?? '';
            return domain === currentDomainId
                ? (node.data.entityId as string)
                : fqid;
        },
        [nodes, currentDomainId],
    );

    // ============ Центрирование ============
    const rfInstance = useReactFlow();
    const handleResetView = useCallback(() => {
        rfInstance.fitView({ padding: 0.15, duration: 300 });
    }, [rfInstance]);

    const didInitialFit = useRef(false);
    useEffect(() => {
        if (didInitialFit.current) return;
        if (nodes.length === 0) return;
        didInitialFit.current = true;
        requestAnimationFrame(() => rfInstance.fitView({ padding: 0.15 }));
    }, [nodes.length, rfInstance]);

    return (
        <div className="dc-graph-root">
            <GraphToolbar
                filter={filter}
                onFilterChange={setFilter}
                onResetView={handleResetView}
            />

            <div className="dc-graph-canvas">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    onNodeClick={handleNodeClick}
                    onConnect={handleConnect}
                    isValidConnection={(c) => c.source !== c.target}
                    connectionLineStyle={{
                        stroke: 'var(--accent)',
                        strokeWidth: 2,
                        strokeDasharray: '5 4',
                    }}
                    // Граф read-only: узлы не удаляются, рёбра не перетаскиваются
                    nodesConnectable
                    nodesDraggable
                    elementsSelectable
                    deleteKeyCode={null}
                    proOptions={{ hideAttribution: true }}
                    minZoom={0.15}
                    maxZoom={2}
                    fitView
                    fitViewOptions={{ padding: 0.15 }}
                >
                    <Background gap={24} size={1.2} color="var(--graph-dots)" />
                    <Controls showInteractive={false} />
                    <MiniMap
                        pannable
                        zoomable
                        nodeColor={() => 'var(--bg-700)'}
                        maskColor="rgba(0,0,0,0.5)"
                        style={{ background: 'var(--bg-800)', border: '1px solid var(--border)' }}
                    />
                </ReactFlow>

                {nodes.length === 0 && (
                    <div className="dc-graph-empty">
                        <p>Нет элементов для отображения.</p>
                        <p className="dc-muted">Включите слои выше или очистите поиск.</p>
                    </div>
                )}
            </div>

            <AddLinkageModal
                open={!!pendingConnection}
                onClose={() => setPendingConnection(null)}
                presetSide1={
                    pendingConnection
                        ? fqidToSideRef(pendingConnection.sourceFqid)
                        : undefined
                }
                presetSide2={
                    pendingConnection
                        ? fqidToSideRef(pendingConnection.targetFqid)
                        : undefined
                }
                onCreated={() => {
                    setPendingConnection(null);
                }}
            />
        </div>
    );
};

export const DomainGraph: FC = () => (
    <ReactFlowProvider>
        <DomainGraphInner2 />
    </ReactFlowProvider>
);