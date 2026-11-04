import React, { useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';
import { pluralFew } from '../../lib';

interface ActiveMode {
    iconName?: string;
    icon?: string;
    label: string;
    color: string;
    onClear: () => void;
    nav?: {
        onPrev: () => void;
        onNext: () => void;
        hotkeyHint?: string;
    };
    title?: string;
}

export interface ActiveModesBarProps {
    ruleViolationsCount: number;
}

export function ActiveModesBar({ ruleViolationsCount }: ActiveModesBarProps) {
    const nodes = useGraphStore((s) => s.nodes);
    const cycleHighlight = useGraphStore((s) => s.cycleHighlight);
    const focusNode = useGraphStore((s) => s.focusNode);
    const focusDepth = useGraphStore((s) => s.focusDepth);

    const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
    const pathResult = useGraphStore((s) => s.pathResult);
    const pathSel = useGraphStore((s) => s.pathSel);
    const pathMode = useGraphStore((s) => s.pathMode);
    const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);
    const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
    const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
    const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
    const nsMode = useGraphStore((s) => s.nsMode);
    const diffMode = useGraphStore((s) => s.diffMode);
    const rulesHighlighted = useGraphStore((s) => s.rulesHighlighted);
    const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
    const sidePanelEnabled = useGraphStore((s) => s.sidePanelEnabled);
    const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
    const filters = useGraphStore((s) => s.filters);
    const topoLevelMap = useGraphStore((s) => s.topoLevelMap);
    const tagFilters = useGraphStore((s) => s.tagFilters);

    const modes = useMemo<ActiveMode[]>(() => {
        const result: ActiveMode[] = [];

        if (cycleHighlight) {
            const total = cycleHighlight.cycles.length;
            const idx = cycleHighlight.activeIndex;
            const active = cycleHighlight.cycles[idx];
            const size = active?.nodeIds.size ?? 0;

            const preview = active
                ? nodes
                    .filter((n) => active.nodeIds.has(n.id))
                    .slice(0, 5)
                    .map((n) => n.data.domainId)
                    .join(" → ") +
                (active.nodeIds.size > 5 ? ` → … (+${active.nodeIds.size - 5})` : "")
                : "";

            result.push({
                iconName: "cycle",
                label:
                    total === 1
                        ? `Цикл (${size} ${pluralFew(size, "узел", "узла", "узлов")})`
                        : `Цикл ${idx + 1} / ${total} (${size} узл.)`,
                color: "orange",
                title: preview || undefined,
                nav:
                    total > 1
                        ? {
                            onPrev: () => useGraphStore.getState().setActiveCycleIndex(idx - 1),
                            onNext: () => useGraphStore.getState().setActiveCycleIndex(idx + 1),
                            hotkeyHint: "[ / ]",
                        }
                        : undefined,
                onClear: () => {
                    const st = useGraphStore.getState();
                    st.setCycleHighlight(null);
                    st.setSelectedNodeId(null);
                    st.setSelectedEdgeId(null);
                },
            });
        }

        if (focusNode) {
            const fn = nodes.find((n) => n.id === focusNode);
            result.push({
                iconName: 'my_location',
                label: 'Фокус N=' + focusDepth + (fn ? ': ' + fn.data.domainId : ''),
                color: 'cyan',
                onClear: () => {
                    const st = useGraphStore.getState();
                    st.setFocusNode(null);
                    st.setSelectedNodeId(null);
                    st.setSelectedEdgeId(null);
                }
            });
        } else if (selectedNodeId) {
            const sn = nodes.find((n) => n.id === selectedNodeId);
            result.push({
                iconName: 'visibility',
                label: sn ? sn.data.domainId : 'узел',
                color: 'accent',
                onClear: () => {
                    const st = useGraphStore.getState();
                    st.setSelectedNodeId(null);
                    st.setSelectedEdgeId(null);
                }
            });
        }

        if (pathResult || pathSel.length > 0) {
            result.push({
                iconName: 'route',
                label: pathResult
                    ? 'Путь найден'
                    : 'Выбор пути (' + pathSel.length + '/2)',
                color: 'yellow',
                onClear: () => {
                    const st = useGraphStore.getState();
                    st.setPathResult(null);
                    st.setPathSel([]);
                    st.setPathMode(null);
                    st.setSelectedNodeId(null);
                    st.setSelectedEdgeId(null);
                }
            });
        }

        if (hiddenNodeIds.size > 0) {
            result.push({
                iconName: 'visibility_off',
                label: 'Скрыто: ' + hiddenNodeIds.size,
                color: 'gray',
                onClear: () => useGraphStore.getState().resetHiddenNodes()
            });
        }

        if (onlyInvalid) {
            result.push({
                iconName: 'cancel',
                label: 'Только невалидные',
                color: 'red',
                onClear: () => useGraphStore.getState().setOnlyInvalid(false)
            });
        }

        if (bookmarksOnly) {
            result.push({
                iconName: 'star',
                label: 'Только избранные',
                color: 'yellow',
                onClear: () => useGraphStore.getState().setBookmarksOnly(false)
            });
        }

        if (nsMode) {
            result.push({
                iconName: 'category',
                label: 'Схлопнуть в семейства',
                color: 'purple',
                onClear: () => useGraphStore.getState().setNsMode(false)
            });
        }

        if (diffMode) {
            const added = diffMode.addedEdges.size + diffMode.addedNodes.size;
            const removed = diffMode.removedEdges.size + diffMode.removedNodes.size;
            result.push({
                iconName: 'swap_horiz',
                label: 'Diff +' + added + '/−' + removed,
                color: 'blue',
                onClear: () => useGraphStore.getState().setDiffMode(null)
            });
        }

        if (ruleViolationsCount > 0 && rulesHighlighted) {
            result.push({
                iconName: 'block',
                label: 'Нарушения: ' + ruleViolationsCount,
                color: 'red',
                onClear: () => useGraphStore.getState().setRulesHighlighted(false)
            });
        }

        if (!tooltipsEnabled) {
            result.push({
                iconName: 'block',
                label: 'Тултипы выключены',
                color: 'gray',
                onClear: () => useGraphStore.getState().setTooltipsEnabled(true)
            });
        }

        if (topoLevelMap) {
            result.push({
                iconName: 'inventory_2',
                label: 'Уровни установки',
                color: 'green',
                onClear: () => useGraphStore.getState().setTopoLevelMap(null)
            });
        }

        if (!sidePanelEnabled) {
            result.push({
                iconName: 'block',
                label: 'Панель выключена',
                color: 'gray',
                onClear: () => useGraphStore.getState().setSidePanelEnabled(true)
            });
        }

        if (!filters.linkage && !filters.fqid) {
            result.push({
                iconName: 'power_off',
                label: 'Связи скрыты',
                color: 'gray',
                onClear: () =>
                    useGraphStore.getState().setFilters((f) => ({ ...f, linkage: true, fqid: true }))
            });
        }

        if (namespaceFilter && namespaceFilter.trim()) {
            result.push({
                iconName: 'filter_alt',
                label:
                    'Фильтр: ' +
                    (namespaceFilter.length > 30
                        ? namespaceFilter.slice(0, 30) + '…'
                        : namespaceFilter),
                color: 'cyan',
                onClear: () => useGraphStore.getState().setNamespaceFilter('')
            });
        }

        if (isolatedOnly) {
            result.push({
                iconName: 'radio_button_unchecked',
                label: 'Только изолированные',
                color: 'orange',
                onClear: () => useGraphStore.getState().setIsolatedOnly(false)
            });
        }

        if (pathMode) {
            result.push({
                iconName: 'route',
                label: pathMode.anchorId ? 'Выберите второй узел' : 'Выберите первый узел',
                color: 'yellow',
                onClear: () => {
                    const st = useGraphStore.getState();
                    st.setPathMode(null);
                    st.setPathSel([]);
                }
            });
        }

        if (tagFilters.size > 0) {
            result.push({
                iconName: 'label',
                label: 'Теги: ' + Array.from(tagFilters).join(', '),
                color: 'purple',
                onClear: () => useGraphStore.getState().setTagFilters(new Set())
            });
        }

        return result;
    }, [
        cycleHighlight, focusNode, focusDepth,
        selectedNodeId, pathResult, pathSel, pathMode,
        hiddenNodeIds, onlyInvalid, bookmarksOnly,
        isolatedOnly, nsMode, diffMode,
        rulesHighlighted, tooltipsEnabled, sidePanelEnabled,
        namespaceFilter, filters.linkage, filters.fqid,
        topoLevelMap, tagFilters, ruleViolationsCount,
        nodes
    ]);

    if (modes.length === 0) return null;

    return (
        <div className="active-modes">
            {modes.map((m, i) => (
                <div key={i} className={'active-mode active-mode--' + (m.color || 'accent')} title={m.title}>
                    <span className="active-mode__icon">
                        {m.iconName ? <MIcon name={m.iconName} size="sm" /> : m.icon}
                    </span>
                    {m.nav && (
                        <button
                            className="active-mode__nav"
                            onClick={m.nav.onPrev}
                            title={`Предыдущий цикл (${m.nav.hotkeyHint})`}
                        >
                            ◀
                        </button>
                    )}
                    <span className="active-mode__label">{m.label}</span>
                    {m.nav && (
                        <button
                            className="active-mode__nav"
                            onClick={m.nav.onNext}
                            title={`Следующий цикл (${m.nav.hotkeyHint})`}
                        >
                            ▶
                        </button>
                    )}
                    <button className="active-mode__close" onClick={m.onClear} title="Отключить">
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}