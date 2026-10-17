import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    Handle,
    MiniMap,
    NodeTypes,
    Position,
    ReactFlowProvider,
    useReactFlow
} from 'reactflow';
import dagre from 'dagre';

import type { EntityTree, EntityTreeNode } from '../../lib/types';

import {
    BaseEdge,
    EdgeProps,
    getSmoothStepPath,
    EdgeTypes
} from 'reactflow';

// ============ Custom edge с тултипом ============

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

    const kind = (data && (data as any).kind) || 'inheritance';
    const label = (data && (data as any).label) || '';
    const title =
        kind === 'inheritance' ? 'наследование' :
            kind === 'reference' ? `атрибут: ${label}` :
                `связь: ${label}`;

    return (
        <>
            <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                style={{ cursor: 'pointer' }}
            >
                <title>{title}</title>
            </path>
        </>
    );
}

const edgeTypes: EdgeTypes = { entityEdge: EntityEdge as any };

const NODE_WIDTH = 200;
const NODE_HEIGHT = 64;
const ROOT_WIDTH = 240;
const ROOT_HEIGHT = 76;

// ============ Custom node ============

interface FlowNodeData {
    key: string;
    domainId: string;
    entityId: string;
    name: string | null;
    missing: boolean;
    isRoot: boolean;
    isCycle: boolean;
    isForeign: boolean;
    rootDomainId: string;
}

function EntityFlowNode({ data }: { data: FlowNodeData }) {
    const cls = ['entity-flow-node'];
    if (data.isRoot) cls.push('entity-flow-node--root');
    if (data.isCycle) cls.push('entity-flow-node--cycle');
    if (data.missing) cls.push('entity-flow-node--missing');
    if (data.isForeign) cls.push('entity-flow-node--foreign');

    return (
        <>
            <Handle type="target" position={Position.Top} className="entity-flow-handle" />
            <div className={cls.join(' ')}>
                <div className="entity-flow-node__id">
                    {data.missing && '⚠️ '}
                    {data.entityId}
                </div>
                {data.name && data.name !== data.entityId && (
                    <div className="entity-flow-node__name">{data.name}</div>
                )}
                <div className="entity-flow-node__domain">{data.domainId}</div>
            </div>
            <Handle type="source" position={Position.Bottom} className="entity-flow-handle" />
        </>
    );
}

const nodeTypes: NodeTypes = { entityNode: EntityFlowNode as any };

// ============ Layout ============

function layoutWithDagre(
    nodes: Array<{ id: string; width: number; height: number }>,
    edges: Array<{ source: string; target: string }>
): Map<string, { x: number; y: number }> {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
        rankdir: 'TB',
        nodesep: 40,
        ranksep: 80,
        marginx: 40,
        marginy: 40
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    nodes.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));
    edges.forEach((e) => {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            g.setEdge(e.source, e.target);
        }
    });

    dagre.layout(g);

    const result = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => {
        const pos = g.node(n.id);
        if (!pos) return;
        result.set(n.id, {
            x: pos.x - n.width / 2,
            y: pos.y - n.height / 2
        });
    });
    return result;
}

// ============ Inner ============

interface InnerProps {
    tree: EntityTree;
    onSelect: (node: { key: string; missing: boolean }) => void;
}

function EntityHierarchyFlowInner({ tree, onSelect }: InnerProps) {
    const rf = useReactFlow();
    const rootDomainId = (tree.rootKey.split('/')[0] || '').toLowerCase();

    const { flowNodes, flowEdges } = useMemo(() => {
        // Готовим узлы
        const initialNodes = tree.nodes.map((n) => {
            const isRoot = n.key === tree.rootKey;
            return {
                id: n.key,
                type: 'entityNode',
                position: { x: 0, y: 0 },
                data: {
                    key: n.key,
                    domainId: n.domainId,
                    entityId: n.entityId,
                    name: n.name,
                    missing: n.missing,
                    isRoot,
                    isCycle: tree.cycleNodes.has(n.key),
                    isForeign: !isRoot && n.domainId.toLowerCase() !== rootDomainId,
                    rootDomainId
                } as FlowNodeData,
                width: isRoot ? ROOT_WIDTH : NODE_WIDTH,
                height: isRoot ? ROOT_HEIGHT : NODE_HEIGHT
            };
        });

        // Рёбра для dagre
        const layoutEdges = tree.edges.map((e) => ({
            source: e.source,
            target: e.target
        }));

        const positions = layoutWithDagre(
            initialNodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
            layoutEdges
        );

        const flowNodes = initialNodes.map((n) => {
            const pos = positions.get(n.id);
            return {
                ...n,
                position: pos || { x: 0, y: 0 }
            };
        });

        // Рёбра ReactFlow
        const flowEdges = tree.edges.map((e) => {
            const stroke =
                e.kind === 'inheritance' ? '#a78bfa' :
                    e.kind === 'reference' ? '#6366f1' :
                        '#10b981';
            return {
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'entityEdge',  
                data: { label: e.label, kind: e.kind },
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

        return { flowNodes, flowEdges };
    }, [tree, rootDomainId]);

    // Автофит при смене состава
    useEffect(() => {
        if (flowNodes.length === 0) return;
        const t = setTimeout(() => {
            try {
                rf.fitView({ duration: 400, padding: 0.15 });
            } catch { }
        }, 120);
        return () => clearTimeout(t);
    }, [flowNodes.length, flowEdges.length, rf]);

    const handleNodeClick = useCallback(
        (_: React.MouseEvent, node: any) => {
            if (!node?.data) return;
            onSelect({ key: node.data.key, missing: node.data.missing });
        },
        [onSelect]
    );

    return (
        <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes} 
            onNodeClick={handleNodeClick}
            fitView
            minZoom={0.1}
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
                nodeColor={(n: any) => {
                    if (n.data?.isRoot) return '#6366f1';
                    if (n.data?.isCycle) return '#ef4444';
                    if (n.data?.missing) return '#f59e0b';
                    return '#10b981';
                }}
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 160, height: 120 }}
            />
        </ReactFlow>
    );
}

// ============ Export ============

export interface EntityHierarchyFlowProps {
    tree: EntityTree;
    onSelect: (node: any) => void;
}

export function EntityHierarchyFlow(props: EntityHierarchyFlowProps) {
    return (
        <ReactFlowProvider>
            <EntityHierarchyFlowInner {...props} />
        </ReactFlowProvider>
    );
}