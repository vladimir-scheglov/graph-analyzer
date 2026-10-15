import React, { useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

interface ActiveMode {
    iconName?: string;
    icon?: string;
    label: string;
    color: string;
    onClear: () => void;
}

export interface ActiveModesBarProps {
    ruleViolationsCount: number;
}

export function ActiveModesBar({ ruleViolationsCount }: ActiveModesBarProps) {
    const store = useGraphStore();

    const modes = useMemo<ActiveMode[]>(() => {
        const result: ActiveMode[] = [];
        const nodes = store.nodes;

        if (store.cycleHighlight) {
            result.push({
                iconName: 'cycle',
                label: 'Циклы (' + store.cycleHighlight.sccCount + ')',
                color: 'orange',
                onClear: () => {
                    store.setCycleHighlight(null);
                    store.setSelectedNodeId(null);
                    store.setSelectedEdgeId(null);
                }
            });
        }

        if (store.focusNode) {
            const fn = nodes.find((n) => n.id === store.focusNode);
            result.push({
                iconName: 'my_location',
                label: 'Фокус N=' + store.focusDepth + (fn ? ': ' + fn.data.domainId : ''),
                color: 'cyan',
                onClear: () => {
                    store.setFocusNode(null);
                    store.setSelectedNodeId(null);
                    store.setSelectedEdgeId(null);
                }
            });
        } else if (store.selectedNodeId) {
            const sn = nodes.find((n) => n.id === store.selectedNodeId);
            result.push({
                iconName: 'visibility',
                label: sn ? sn.data.domainId : 'узел',
                color: 'accent',
                onClear: () => {
                    store.setSelectedNodeId(null);
                    store.setSelectedEdgeId(null);
                }
            });
        }

        if (store.pathResult || store.pathSel.length > 0) {
            result.push({
                iconName: 'route',
                label: store.pathResult
                    ? 'Путь найден'
                    : 'Выбор пути (' + store.pathSel.length + '/2)',
                color: 'yellow',
                onClear: () => {
                    store.setPathResult(null);
                    store.setPathSel([]);
                    store.setPathMode(null);
                    store.setSelectedNodeId(null);
                    store.setSelectedEdgeId(null);
                }
            });
        }

        if (store.hiddenNodeIds.size > 0) {
            result.push({
                iconName: 'visibility_off',
                label: 'Скрыто: ' + store.hiddenNodeIds.size,
                color: 'gray',
                onClear: () => store.resetHiddenNodes()
            });
        }

        if (store.onlyInvalid) {
            result.push({
                iconName: 'cancel',
                label: 'Только невалидные',
                color: 'red',
                onClear: () => store.setOnlyInvalid(false)
            });
        }

        if (store.bookmarksOnly) {
            result.push({
                iconName: 'star',
                label: 'Только избранные',
                color: 'yellow',
                onClear: () => store.setBookmarksOnly(false)
            });
        }

        if (store.nsMode) {
            result.push({
                iconName: 'category',
                label: 'Агрегация по семействам',
                color: 'purple',
                onClear: () => store.setNsMode(false)
            });
        }

        if (store.diffMode) {
            const added = store.diffMode.addedEdges.size + store.diffMode.addedNodes.size;
            const removed = store.diffMode.removedEdges.size + store.diffMode.removedNodes.size;
            result.push({
                iconName: 'swap_horiz',
                label: 'Diff +' + added + '/−' + removed,
                color: 'blue',
                onClear: () => store.setDiffMode(null)
            });
        }

        if (ruleViolationsCount > 0 && store.rulesHighlighted) {
            result.push({
                iconName: 'block',
                label: 'Нарушения: ' + ruleViolationsCount,
                color: 'red',
                onClear: () => store.setRulesHighlighted(false)
            });
        }

        if (!store.tooltipsEnabled) {
            result.push({
                iconName: 'block',
                label: 'Тултипы выключены',
                color: 'gray',
                onClear: () => store.setTooltipsEnabled(true)
            });
        }

        if (store.topoLevelMap) {
            result.push({
                iconName: 'inventory_2',
                label: 'Уровни установки',
                color: 'green',
                onClear: () => store.setTopoLevelMap(null)
            });
        }

        if (!store.sidePanelEnabled) {
            result.push({
                iconName: 'block',
                label: 'Панель выключена',
                color: 'gray',
                onClear: () => store.setSidePanelEnabled(true)
            });
        }

        if (!store.filters.linkage && !store.filters.fqid) {
            result.push({
                iconName: 'power_off',
                label: 'Связи скрыты',
                color: 'gray',
                onClear: () =>
                    store.setFilters((f) => ({ ...f, linkage: true, fqid: true }))
            });
        }

        if (store.namespaceFilter && store.namespaceFilter.trim()) {
            result.push({
                iconName: 'filter_alt',
                label:
                    'Фильтр: ' +
                    (store.namespaceFilter.length > 30
                        ? store.namespaceFilter.slice(0, 30) + '…'
                        : store.namespaceFilter),
                color: 'cyan',
                onClear: () => store.setNamespaceFilter('')
            });
        }

        if (store.isolatedOnly) {
            result.push({
                iconName: 'radio_button_unchecked',
                label: 'Только изолированные',
                color: 'orange',
                onClear: () => store.setIsolatedOnly(false)
            });
        }

        if (store.pathMode) {
            result.push({
                iconName: 'route',
                label: store.pathMode.anchorId ? 'Выберите второй узел' : 'Выберите первый узел',
                color: 'yellow',
                onClear: () => {
                    store.setPathMode(null);
                    store.setPathSel([]);
                }
            });
        }

        if (store.tagFilters.size > 0) {
            result.push({
                iconName: 'label',
                label: 'Теги: ' + Array.from(store.tagFilters).join(', '),
                color: 'purple',
                onClear: () => store.setTagFilters(new Set())
            });
        }

        return result;
    }, [
        store.cycleHighlight, store.focusNode, store.focusDepth,
        store.selectedNodeId, store.pathResult, store.pathSel, store.pathMode,
        store.hiddenNodeIds, store.onlyInvalid, store.bookmarksOnly,
        store.isolatedOnly, store.nsMode, store.diffMode,
        store.rulesHighlighted, store.tooltipsEnabled, store.sidePanelEnabled,
        store.namespaceFilter, store.filters.linkage, store.filters.fqid,
        store.topoLevelMap, store.tagFilters, ruleViolationsCount,
        store.nodes
    ]);

    if (modes.length === 0) return null;

    return (
        <div className="active-modes">
            {modes.map((m, i) => (
                <div key={i} className={'active-mode active-mode--' + (m.color || 'accent')}>
                    <span className="active-mode__icon">
                        {m.iconName ? <MIcon name={m.iconName} size="sm" /> : m.icon}
                    </span>
                    <span className="active-mode__label">{m.label}</span>
                    <button className="active-mode__close" onClick={m.onClear} title="Отключить">
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}