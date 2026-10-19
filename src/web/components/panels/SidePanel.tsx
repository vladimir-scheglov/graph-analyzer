import React, { useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { DetailsTab } from './DetailsTab';
import { EdgeTab } from './EdgeTab';
import { EntitiesTab } from './EntitiesTab';
import type { EntityIndex } from '../../lib/types';

export interface SidePanelProps {
    allNodes: any[];
    allEdges: any[];
    visibleNodes: any[];
    visibleEdges: any[];
    entities: any[];
    entityIndex: EntityIndex | null;
    ruleViolations: any[];
    onOpenEntityHierarchy: (key: string) => void;
}

export function SidePanel(props: SidePanelProps) {
    const store = useGraphStore();

    const panelNode = useMemo(() => {
        if (!store.panelNodeId) return null;
        return (
            props.visibleNodes.find((n) => n.id === store.panelNodeId) ||
            props.allNodes.find((n) => n.id === store.panelNodeId) ||
            null
        );
    }, [store.panelNodeId, props.visibleNodes, props.allNodes]);

    const panelEdge = useMemo(() => {
        if (!store.selectedEdgeId) return null;
        return (
            props.visibleEdges.find((e) => e.id === store.selectedEdgeId) ||
            props.allEdges.find((e) => e.id === store.selectedEdgeId) ||
            null
        );
    }, [store.selectedEdgeId, props.visibleEdges, props.allEdges]);

    const ruleViolationsFiltered = useMemo(() => {
        if (!panelNode) return [];
        return props.ruleViolations.filter(
            (v: any) =>
                v.fromId === panelNode.data.domainId || v.toId === panelNode.data.domainId
        );
    }, [props.ruleViolations, panelNode]);

    if (!store.panelOpen) return null;

    return (
        <div className="side-panel open">
            <div className="side-panel__header">
                <div className="side-panel__tabs">
                    <button
                        className={'side-panel__tab' + (store.panelTab === 'details' ? ' active' : '')}
                        onClick={() => store.setPanelTab('details')}
                    >
                        📋 Детали
                    </button>
                    {store.viewMode === "graph" && (
                        <button
                            className={'side-panel__tab' + (store.panelTab === 'edge' ? ' active' : '')}
                            onClick={() => store.setPanelTab('edge')}
                        >
                            🔗 Связь
                        </button>
                    )}
                    <button
                        className={'side-panel__tab' + (store.panelTab === 'entities' ? ' active' : '')}
                        onClick={() => store.setPanelTab('entities')}
                    >
                        🧬 Сущности
                    </button>
                </div>
                <button
                    className="btn btn--icon"
                    onClick={() => store.setPanelOpen(false)}
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>

            <div className="side-panel__body" style={{ position: 'relative' }}>
                <div
                    className={
                        'side-panel__pane' +
                        (store.panelTab !== 'details' ? ' side-panel__pane--hidden' : '')
                    }
                >
                    <DetailsTab
                        node={panelNode}
                        allNodes={props.allNodes}
                        allEdges={props.allEdges}
                        ruleViolations={ruleViolationsFiltered}
                    />
                </div>

                <div
                    className={
                        'side-panel__pane' +
                        (store.panelTab !== 'edge' ? ' side-panel__pane--hidden' : '')
                    }
                >
                    <EdgeTab edge={panelEdge} allNodes={props.allNodes} />
                </div>

                <div
                    className={
                        'side-panel__pane' +
                        (store.panelTab !== 'entities' ? ' side-panel__pane--hidden' : '')
                    }
                >
                    <EntitiesTab
                        node={panelNode}
                        entities={props.entities}
                        entityIndex={props.entityIndex}
                        onOpenEntityHierarchy={props.onOpenEntityHierarchy}
                    />
                </div>
            </div>
        </div>
    );
}