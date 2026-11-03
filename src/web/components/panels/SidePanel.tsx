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
    const panelNodeId = useGraphStore((s) => s.panelNodeId);
    const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
    const panelOpen = useGraphStore((s) => s.panelOpen);
    const panelTab = useGraphStore((s) => s.panelTab);
    const viewMode = useGraphStore((s) => s.viewMode);

    const panelNode = useMemo(() => {
        if (!panelNodeId) return null;
        return (
            props.visibleNodes.find((n) => n.id === panelNodeId) ||
            props.allNodes.find((n) => n.id === panelNodeId) ||
            null
        );
    }, [panelNodeId, props.visibleNodes, props.allNodes]);

    const panelEdge = useMemo(() => {
        if (!selectedEdgeId) return null;
        return (
            props.visibleEdges.find((e) => e.id === selectedEdgeId) ||
            props.allEdges.find((e) => e.id === selectedEdgeId) ||
            null
        );
    }, [selectedEdgeId, props.visibleEdges, props.allEdges]);

    const ruleViolationsFiltered = useMemo(() => {
        if (!panelNode) return [];
        return props.ruleViolations.filter(
            (v: any) =>
                v.fromId === panelNode.data.domainId || v.toId === panelNode.data.domainId
        );
    }, [props.ruleViolations, panelNode]);

    if (!panelOpen) return null;

    return (
        <div className="side-panel open">
            <div className="side-panel__header">
                <div className="side-panel__tabs">
                    <button
                        className={'side-panel__tab' + (panelTab === 'details' ? ' active' : '')}
                        onClick={() => useGraphStore.getState().setPanelTab('details')}
                    >
                        📋 Детали
                    </button>
                    {viewMode === "graph" && (
                        <button
                            className={'side-panel__tab' + (panelTab === 'edge' ? ' active' : '')}
                            onClick={() => useGraphStore.getState().setPanelTab('edge')}
                        >
                            🔗 Связь
                        </button>
                    )}
                    <button
                        className={'side-panel__tab' + (panelTab === 'entities' ? ' active' : '')}
                        onClick={() => useGraphStore.getState().setPanelTab('entities')}
                    >
                        🧬 Сущности
                    </button>
                </div>
                <button
                    className="btn btn--icon"
                    onClick={() => useGraphStore.getState().setPanelOpen(false)}
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>

            <div className="side-panel__body" style={{ position: 'relative' }}>
                <div
                    className={
                        'side-panel__pane' +
                        (panelTab !== 'details' ? ' side-panel__pane--hidden' : '')
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
                        (panelTab !== 'edge' ? ' side-panel__pane--hidden' : '')
                    }
                >
                    <EdgeTab edge={panelEdge} allNodes={props.allNodes} />
                </div>

                <div
                    className={
                        'side-panel__pane' +
                        (panelTab !== 'entities' ? ' side-panel__pane--hidden' : '')
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