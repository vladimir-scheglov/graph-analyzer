import React, { useEffect, useMemo } from 'react';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ReactFlowProvider,
    useReactFlow,
    useStore,
    NodeTypes
} from 'reactflow';
import { useGraphStore } from '../../state/useGraphStore';
import { DomainNode } from './DomainNode';
import { GroupsOverlay } from './GroupsOverlay';

const nodeTypes: NodeTypes = { domainNode: DomainNode };

// ============ Внутренний компонент — получает доступ к useReactFlow ============

interface GraphViewInnerProps {
    nodes: any[];
    edges: any[];
    onNodesChange: (changes: any) => void;
    onEdgesChange: (changes: any) => void;
    onNodeClick: (e: React.MouseEvent, node: any) => void;
    onNodeDoubleClick: (e: React.MouseEvent, node: any) => void;
    onNodeContextMenu: (e: React.MouseEvent, node: any) => void;
    onNodeMouseEnter: (e: React.MouseEvent, node: any) => void;
    onNodeMouseLeave: () => void;
    onEdgeClick: (e: React.MouseEvent, edge: any) => void;
    onEdgeMouseEnter: (e: React.MouseEvent, edge: any) => void;
    onEdgeMouseLeave: () => void;
    onPaneClick: () => void;
    onPaneContextMenu: (e: React.MouseEvent) => void;
    showGroups: boolean;
    clusterBoxes: any[];
    perfMode: boolean;
}

const GraphViewInner = React.memo(function GraphViewInner(props: GraphViewInnerProps) {
    const rf = useReactFlow();
    const setRfInstance = useGraphStore((s) => s.setRfInstance);

    useEffect(() => {
        setRfInstance(rf);
    }, [rf, setRfInstance]);

    // При zoom < 0.5 — скрывать подписи рёбер
    const zoomClass = useStore((s) => (s.transform[2] < 0.5 ? 'hide' : 'show'));

    useEffect(() => {
        const el = document.querySelector('.graph-container');
        if (!el) return;
        el.classList.toggle('hide-labels', zoomClass === 'hide');
    }, [zoomClass]);

    // Класс perf-mode
    useEffect(() => {
        const el = document.querySelector('.graph-container');
        if (!el) return;
        el.classList.toggle('perf-mode', !!props.perfMode);
    }, [props.perfMode]);

    const defaultEdgeOptions = useMemo(
        () => ({
            type: props.perfMode ? 'default' : 'smoothstep',
            animated: false
        }),
        [props.perfMode]
    );

    return (
        <ReactFlow
            nodes={props.nodes}
            edges={props.edges}
            onNodesChange={props.onNodesChange}
            onEdgesChange={props.onEdgesChange}
            onEdgeClick={props.onEdgeClick}
            nodeTypes={nodeTypes}
            onNodeClick={props.onNodeClick}
            onNodeDoubleClick={props.onNodeDoubleClick}
            onNodeContextMenu={props.onNodeContextMenu}
            onNodeMouseEnter={props.onNodeMouseEnter}
            onNodeMouseLeave={props.onNodeMouseLeave}
            onEdgeMouseEnter={props.onEdgeMouseEnter}
            onEdgeMouseLeave={props.onEdgeMouseLeave}
            onPaneClick={props.onPaneClick}
            onPaneContextMenu={props.onPaneContextMenu}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.05}
            maxZoom={4}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements={false}
            defaultEdgeOptions={defaultEdgeOptions}
        >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-dots)" />
            <Controls position="bottom-left" />
            <MiniMap
                position="bottom-right"
                nodeColor={(n: any) => {
                    const t = n.data && n.data.nodeType;
                    if (t === 'missing') return '#f59e0b';
                    if (t === 'broken') return '#ef4444';
                    return '#10b981';
                }}
                maskColor="rgba(10,14,26,0.7)"
                style={{ width: 180, height: 130 }}
            />
            {props.showGroups && props.clusterBoxes.length > 0 && (
                <GroupsOverlay boxes={props.clusterBoxes} />
            )}
        </ReactFlow>
    );
});

// ============ Обёртка с провайдером ============

export interface GraphViewProps extends Omit<GraphViewInnerProps, 'showGroups' | 'clusterBoxes' | 'perfMode'> {
    showGroups: boolean;
    clusterBoxes: any[];
    perfMode: boolean;
}

export function GraphView(props: GraphViewProps) {
    return (
        <ReactFlowProvider>
            <GraphViewInner {...props} />
        </ReactFlowProvider>
    );
}