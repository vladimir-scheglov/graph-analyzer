import React, { useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useMonaco } from '../../hooks/useMonaco';
import { DetailsTab } from './DetailsTab';
import { EdgeTab } from './EdgeTab';
import { EntitiesTab } from './EntitiesTab';
import { FileTab } from './FileTab';
import type { EntityIndex } from '../../lib/types';

export interface SidePanelProps {
    allNodes: any[];
    allEdges: any[];
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
            store.nodes.find((n) => n.id === store.panelNodeId) || null
        );
    }, [store.panelNodeId, store.nodes]);

    const panelEdge = useMemo(() => {
        if (!store.selectedEdgeId) return null;
        return (
            store.edges.find((e) => e.id === store.selectedEdgeId) || null
        );
    }, [store.selectedEdgeId, store.edges]);

    // Монтирование Monaco — когда открыта вкладка "file" и есть путь
    useMonaco(store.panelOpen && store.panelTab === 'file', store.pendingFile);

    // Автоподгрузка файла, если выбрана вкладка и есть путь
    React.useEffect(() => {
        if (!store.panelOpen || store.panelTab !== 'file') return;
        if (!panelNode) return;
        if (!panelNode.data.filePath) return;
        if (store.editorFilePath === panelNode.data.filePath && store.pendingFile) return;
        // Открытие файла проброшено в callback — App это подхватит
        document.dispatchEvent(
            new CustomEvent('dg:open-file', { detail: { filePath: panelNode.data.filePath } })
        );
    }, [store.panelOpen, store.panelTab, store.panelNodeId, panelNode, store.editorFilePath, store.pendingFile]);

    if (!store.panelOpen) return null;

    const ruleViolationsFiltered = useMemo(() => {
        if (!panelNode) return [];
        return props.ruleViolations.filter(
            (v: any) => v.fromId === panelNode.data.domainId || v.toId === panelNode.data.domainId
        );
    }, [props.ruleViolations, panelNode]);

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
                    <button
                        className={'side-panel__tab' + (store.panelTab === 'file' ? ' active' : '')}
                        onClick={() => store.setPanelTab('file')}
                    >
                        📄 Файл
                    </button>
                    <button
                        className={'side-panel__tab' + (store.panelTab === 'edge' ? ' active' : '')}
                        onClick={() => store.setPanelTab('edge')}
                    >
                        🔗 Связь
                    </button>
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
                    className="side-panel__pane"
                    style={{ display: store.panelTab === 'details' ? 'block' : 'none' }}
                >
                    <DetailsTab
                        node={panelNode}
                        allNodes={props.allNodes}
                        allEdges={props.allEdges}
                        ruleViolations={ruleViolationsFiltered}
                    />
                </div>
                <div
                    className="side-panel__pane"
                    style={{ display: store.panelTab === 'edge' ? 'block' : 'none' }}
                >
                    <EdgeTab edge={panelEdge} allNodes={props.allNodes} />
                </div>
                <div
                    className="side-panel__pane"
                    style={{ display: store.panelTab === 'entities' ? 'block' : 'none' }}
                >
                    <EntitiesTab
                        node={panelNode}
                        entities={props.entities}
                        entityIndex={props.entityIndex}
                        onOpenEntityHierarchy={props.onOpenEntityHierarchy}
                    />
                </div>
                <div
                    className="side-panel__pane"
                    style={{ display: store.panelTab === 'file' ? 'block' : 'none' }}
                >
                    <FileTab />
                </div>
            </div>
        </div>
    );
}