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
    const store = useGraphStore();

    return (
        <div
            className={
                'graph-container' +
                (store.viewMode === 'list' ? ' graph-container--list' : '') +
                (store.showEdgeLabels ? ' show-labels' : '')
            }
        >
            {store.viewMode === 'list' ? (
                <DomainList />
            ) : (
                <GraphView
                    nodes={props.visibleNodes}
                    edges={props.displayEdgesForRender}
                    onNodesChange={(changes) =>
                        store.setNodes(
                            (prev) => applyNodeChanges(changes, prev) as unknown as RFNode[]
                        )
                    }
                    onEdgesChange={(changes) =>
                        store.setEdges(
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
                    showGroups={store.showGroups}
                    clusterBoxes={store.clusterBoxes}
                    perfMode={props.perfMode}
                />
            )}

            {store.viewMode === "graph" && props.visibleNodes.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state__icon">
                        <span className="material-symbols-outlined mi-xl">search_off</span>
                    </div>
                    <div className="empty-state__title">Ничего не найдено</div>
                    <div className="empty-state__text">
                        Под текущие фильтры не подходит ни один домен.
                    </div>
                    <div className="empty-state__actions">
                        {store.namespaceFilter && (
                            <button
                                className="btn"
                                onClick={() => store.setNamespaceFilter('')}
                            >
                                Сбросить namespace
                            </button>
                        )}
                        {store.tagFilters.size > 0 && (
                            <button
                                className="btn"
                                onClick={() => store.setTagFilters(new Set())}
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

            {store.heatmap !== 'none' && props.heatmapValues && (
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
                        onClick={() => store.setHeatmap('none')}
                    >
                        ✕
                    </button>
                </div>
            )}

            <SidePanel
                allNodes={store.nodes}
                allEdges={store.edges}
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