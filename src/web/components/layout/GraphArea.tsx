import React from 'react';
import { applyEdgeChanges, applyNodeChanges } from 'reactflow';
import { useGraphStore } from '../../state/useGraphStore';
import { GraphView } from '../graph/GraphView';
import { SidePanel } from '../panels/SidePanel';
import type { RFNode, RFEdge } from '../../lib/types';
import type { EntityIndex } from '../../lib/types';
import type { HeatmapValues } from '../../hooks/useHeatmapValues';
import type { UseNodeInteractionsResult } from '../../hooks/useNodeInteractions';
import { DomainList } from "./DomainList";

export interface GraphAreaProps {
    visibleNodes: RFNode[];
    visibleEdges: RFEdge[];
    displayEdgesForRender: RFEdge[];
    perfMode: boolean;
    heatmapValues: HeatmapValues | null;
    interactions: UseNodeInteractionsResult;
    entities: any[];
    entityIndex: EntityIndex | null;
    ruleViolations: any[];
    onOpenEntityHierarchy: (key: string) => void;
    onResetAll: () => void;
}

export function GraphArea(props: GraphAreaProps) {
    const viewMode = useGraphStore((s) => s.viewMode);
    const showEdgeLabels = useGraphStore((s) => s.showEdgeLabels);
    const showGroups = useGraphStore((s) => s.showGroups);
    const clusterBoxes = useGraphStore((s) => s.clusterBoxes);
    const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
    const tagFilters = useGraphStore((s) => s.tagFilters);
    const heatmap = useGraphStore((s) => s.heatmap);
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);

    return (
        <div
            className={
                'graph-container' +
                (viewMode === 'list' ? ' graph-container--list' : '') +
                (showEdgeLabels ? ' show-labels' : '')
            }
        >
            {viewMode === 'list' ? (
                <DomainList />
            ) : (
                <GraphView
                    nodes={props.visibleNodes}
                    edges={props.displayEdgesForRender}
                    onNodesChange={(changes) =>
                        useGraphStore.getState().setNodes(
                            (prev) => applyNodeChanges(changes, prev) as unknown as RFNode[]
                        )
                    }
                    onEdgesChange={(changes) =>
                        useGraphStore.getState().setEdges(
                            (prev) => applyEdgeChanges(changes, prev) as unknown as RFEdge[]
                        )
                    }
                    onNodeClick={props.interactions.handleNodeClick}
                    onNodeDoubleClick={props.interactions.handleNodeDoubleClick}
                    onNodeContextMenu={props.interactions.handleNodeContextMenu}
                    onNodeMouseEnter={props.interactions.handleNodeMouseEnter}
                    onNodeMouseLeave={props.interactions.handleNodeMouseLeave}
                    onEdgeClick={props.interactions.handleEdgeClick}
                    onEdgeMouseEnter={props.interactions.handleEdgeMouseEnter}
                    onEdgeMouseLeave={props.interactions.handleEdgeMouseLeave}
                    onPaneClick={props.interactions.handlePaneClick}
                    onPaneContextMenu={props.interactions.handlePaneContextMenu}
                    showGroups={showGroups}
                    clusterBoxes={clusterBoxes}
                    perfMode={props.perfMode}
                />
            )}

            {viewMode === "graph" && props.visibleNodes.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state__icon">
                        <span className="material-symbols-outlined mi-xl">search_off</span>
                    </div>
                    <div className="empty-state__title">Ничего не найдено</div>
                    <div className="empty-state__text">
                        Под текущие фильтры не подходит ни один домен.
                    </div>
                    <div className="empty-state__actions">
                        {namespaceFilter && (
                            <button
                                className="btn"
                                onClick={() => useGraphStore.getState().setNamespaceFilter('')}
                            >
                                Сбросить namespace
                            </button>
                        )}
                        {tagFilters.size > 0 && (
                            <button
                                className="btn"
                                onClick={() => useGraphStore.getState().setTagFilters(new Set())}
                            >
                                Сбросить теги
                            </button>
                        )}
                        <button className="btn btn--primary" onClick={props.onResetAll}>
                            Сбросить всё
                        </button>
                    </div>
                </div>
            )}

            {heatmap !== 'none' && props.heatmapValues && (
                <div className="heat-legend">
                    <div className="heat-legend__title">
                        Heatmap: {props.heatmapValues.scheme.label}
                    </div>
                    <div className="heat-legend__bar" />
                    <div className="heat-legend__labels">
                        <span>{props.heatmapValues.min}</span>
                        <span>{props.heatmapValues.max}</span>
                    </div>
                    <button
                        className="heat-legend__close"
                        onClick={() => useGraphStore.getState().setHeatmap('none')}
                    >
                        ✕
                    </button>
                </div>
            )}

            <SidePanel
                allNodes={nodes}
                allEdges={edges}
                visibleNodes={props.visibleNodes}
                visibleEdges={props.visibleEdges}
                entities={props.entities}
                entityIndex={props.entityIndex}
                ruleViolations={props.ruleViolations}
                onOpenEntityHierarchy={props.onOpenEntityHierarchy}
            />
        </div>
    );
}