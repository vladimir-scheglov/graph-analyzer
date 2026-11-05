import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';
import { DetailsTab } from './DetailsTab';
import { EdgeTab } from './EdgeTab';
import { EntitiesTab } from './EntitiesTab';
import type { EntityIndex, RFNode, RFEdge } from '../../lib/types';

export interface SidePanelProps {
    allNodes: RFNode[];
    allEdges: RFEdge[];
    visibleNodes: RFNode[];
    visibleEdges: RFEdge[];
    entities: any[];
    entityIndex: EntityIndex | null;
    ruleViolations: any[];
    onOpenEntityHierarchy: (key: string) => void;
}

const WIDTH_MIN = 360;
const WIDTH_MAX = 720;
const WIDTH_DEFAULT = 480;
const WIDTH_KEY = 'dg-panel-width';

function readWidth(): number {
    try {
        const raw = localStorage.getItem(WIDTH_KEY);
        if (!raw) return WIDTH_DEFAULT;
        const n = parseInt(raw, 10);
        if (!isFinite(n)) return WIDTH_DEFAULT;
        return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, n));
    } catch {
        return WIDTH_DEFAULT;
    }
}

export function SidePanel(props: SidePanelProps) {
    const panelNodeId = useGraphStore((s) => s.panelNodeId);
    const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
    const panelOpen = useGraphStore((s) => s.panelOpen);
    const panelTab = useGraphStore((s) => s.panelTab);
    const viewMode = useGraphStore((s) => s.viewMode);
    const setPanelTab = useGraphStore((s) => s.setPanelTab);
    const setPanelOpen = useGraphStore((s) => s.setPanelOpen);
    const validationResults = useGraphStore((s) => s.validationResults);

    const [width, setWidth] = useState(readWidth);
    const [resizing, setResizing] = useState(false);
    const asideRef = useRef<HTMLElement>(null);

    // ── Node / edge ──
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

    // ── Violations filtered ──
    const ruleViolationsFiltered = useMemo(() => {
        if (!panelNode) return [];
        return props.ruleViolations.filter(
            (v: any) =>
                v.fromId === panelNode.data.domainId ||
                v.toId === panelNode.data.domainId,
        );
    }, [props.ruleViolations, panelNode]);

    // ── Breadcrumb ──
    const breadcrumb = useMemo(() => {
        if (panelTab === 'edge' && panelEdge) {
            const kind = panelEdge.data?.kind;
            const label =
                panelEdge.data?.fullLabel ||
                panelEdge.label ||
                panelEdge.id;
            return {
                kind: kind === 'linkage' ? 'Связь' : kind === 'fqid' ? 'FQID' : 'Ребро',
                icon: kind === 'linkage' ? 'link' : 'call_made',
                id: String(label),
            };
        }
        if (panelTab === 'entities' && panelNode) {
            return {
                kind: 'Сущности',
                icon: 'category',
                id: panelNode.data.domainId,
            };
        }
        if (panelNode) {
            return {
                kind:
                    panelNode.data.nodeType === 'domain'
                        ? 'Домен'
                        : panelNode.data.nodeType === 'missing'
                            ? 'Отсутствует'
                            : 'Битый',
                icon:
                    panelNode.data.nodeType === 'domain'
                        ? 'folder'
                        : 'warning',
                id: panelNode.data.domainId,
            };
        }
        return null;
    }, [panelTab, panelNode, panelEdge]);

    // ── Validation count for current domain ──
    const validationCount = useMemo(() => {
        if (!panelNode || !validationResults) return 0;
        const v = validationResults.get(panelNode.data.domainId);
        return v?.diagnostics?.length || 0;
    }, [panelNode, validationResults]);

    // ── Entities count for tab badge ──
    const entitiesCount = useMemo(() => {
        if (!panelNode) return 0;
        return props.entities.filter(
            (e) => e.domainId === panelNode.data.domainId,
        ).length;
    }, [props.entities, panelNode]);

    // ── Tabs meta ──
    const tabs = useMemo(
        () => [
            {
                key: 'details' as const,
                label: 'Детали',
                icon: 'info',
                badge:
                    panelNode?.data.nodeType === 'domain' &&
                        (validationCount > 0 ||
                            ruleViolationsFiltered.length > 0)
                        ? validationCount + ruleViolationsFiltered.length
                        : 0,
                badgeVariant: 'danger' as const,
                show: !!panelNode,
            },
            {
                key: 'edge' as const,
                label: 'Связь',
                icon: 'link',
                badge: 0,
                badgeVariant: 'default' as const,
                show: viewMode === 'graph',
            },
            {
                key: 'entities' as const,
                label: 'Сущности',
                icon: 'category',
                badge: entitiesCount,
                badgeVariant: 'success' as const,
                show: !!panelNode && panelNode.data.nodeType === 'domain',
            },
        ],
        [
            panelNode,
            validationCount,
            ruleViolationsFiltered.length,
            entitiesCount,
            viewMode,
        ],
    );

    const visibleTabs = tabs.filter((t) => t.show);

    // Auto-switch away from hidden tab
    useEffect(() => {
        if (panelTab === 'entities' && !tabs.find((t) => t.key === 'entities')?.show) {
            setPanelTab('details');
        }
        if (panelTab === 'edge' && viewMode !== 'graph') {
            setPanelTab('details');
        }
    }, [panelTab, tabs, viewMode, setPanelTab]);

    // ── Resize ──
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setResizing(true);
        const startX = e.clientX;
        const startW = width;

        const onMove = (ev: MouseEvent) => {
            const delta = startX - ev.clientX;
            const next = Math.max(
                WIDTH_MIN,
                Math.min(WIDTH_MAX, startW + delta),
            );
            setWidth(next);
        };
        const onUp = () => {
            setResizing(false);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            // persist
            try {
                localStorage.setItem(
                    WIDTH_KEY,
                    String(
                        Math.max(
                            WIDTH_MIN,
                            Math.min(
                                WIDTH_MAX,
                                parseInt(
                                    String(asideRef.current?.offsetWidth || startW),
                                    10,
                                ) || startW,
                            ),
                        ),
                    ),
                );
            } catch {
                /* ignore */
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // ── Keyboard ──
    useEffect(() => {
        if (!panelOpen) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    tag === 'SELECT' ||
                    target.isContentEditable
                )
                    return;
            }
            if (e.altKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
                const idx = parseInt(e.key, 10) - 1;
                const tab = visibleTabs[idx];
                if (tab) {
                    e.preventDefault();
                    setPanelTab(tab.key);
                }
                return;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [panelOpen, visibleTabs, setPanelTab]);

    if (!panelOpen) return null;

    return (
        <aside
            ref={asideRef}
            className={
                'side-panel open' + (resizing ? ' side-panel--resizing' : '')
            }
            style={{ width }}
        >
            {/* ── Header: tabs + actions ── */}
            <div className="side-panel__header">
                <div className="side-panel__tabs">
                    {visibleTabs.map((t, i) => (
                        <button
                            key={t.key}
                            className={
                                'side-panel__tab' +
                                (panelTab === t.key ? ' active' : '')
                            }
                            onClick={() => setPanelTab(t.key)}
                            title={`${t.label} (Alt+${i + 1})`}
                        >
                            <MIcon name={t.icon} size="sm" />
                            <span>{t.label}</span>
                            {t.badge > 0 && (
                                <span
                                    className={
                                        'side-panel__tab-badge side-panel__tab-badge--' +
                                        t.badgeVariant
                                    }
                                >
                                    {t.badge > 99 ? '99+' : t.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <button
                    className="btn btn--icon"
                    onClick={() => setPanelOpen(false)}
                    title="Закрыть панель (Esc)"
                >
                    ✕
                </button>
            </div>

            {/* ── Breadcrumb ── */}
            {breadcrumb && (
                <div className="side-panel__breadcrumb">
                    <span
                        className={
                            'side-panel__breadcrumb-kind side-panel__breadcrumb-kind--' +
                            (panelNode?.data.nodeType === 'domain'
                                ? 'domain'
                                : panelNode?.data.nodeType === 'missing'
                                    ? 'missing'
                                    : panelNode?.data.nodeType === 'broken'
                                        ? 'broken'
                                        : 'neutral')
                        }
                    >
                        <MIcon name={breadcrumb.icon} size="sm" />
                        {breadcrumb.kind}
                    </span>
                    <code className="side-panel__breadcrumb-id" title={breadcrumb.id}>
                        {breadcrumb.id}
                    </code>
                    <button
                        className="side-panel__breadcrumb-copy"
                        onClick={() => {
                            navigator.clipboard
                                .writeText(breadcrumb.id)
                                .then(() =>
                                    useGraphStore
                                        .getState()
                                        .showSnackbar('Скопировано'),
                                )
                                .catch(() => { });
                        }}
                        title="Копировать ID"
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                </div>
            )}

            {/* ── Body ── */}
            <div className="side-panel__body">
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
                    <EdgeTab
                        edge={panelEdge}
                        allNodes={props.allNodes}
                    />
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

            {/* ── Resizer ── */}
            <div
                className={
                    'side-panel__resizer' +
                    (resizing ? ' side-panel__resizer--active' : '')
                }
                onMouseDown={startResize}
                title="Потяните, чтобы изменить ширину"
            />
        </aside>
    );
}