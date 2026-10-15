import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { applyEdgeChanges, applyNodeChanges } from 'reactflow';
import type { RFNode, RFEdge } from './lib/types';

import { useGraphStore } from './state/useGraphStore';
import {
    readGraphData,
    readRemoteInfo,
    readRefreshCommand,
    buildInitialNodes,
    buildInitialEdges
} from './state/initial';

import {
    useGraphFilters,
    useGraphHighlight,
    useHotkeys,
    useTooltip,
    useSearch,
    useNavigation
} from './hooks';

import { findCycles } from './lib/algorithms/cycles';
import { findPath } from './lib/algorithms/path';
import { runLayout } from './lib/layout';
import { computeHealth } from './lib/health';
import { heatColor, HEATMAPS } from './lib/heatmap';
import { evaluateRules } from './lib/rules';
import { generateMarkdownReport } from './lib/markdown';
import { buildCommands } from './lib/commands';
import { createSnapshot, computeDiff, Snapshot } from './lib/diff';
import { buildEntityIndex } from './lib/entities';
import {
    exportGraphJSON,
    exportMermaid,
    exportPNG,
    exportStatsMarkdown
} from './lib/export';
import { EVT_FIND_CYCLES, EVT_OPEN_FILE } from './lib/events';

import { Toolbar } from './components/layout/Toolbar';
import { ActiveModesBar } from './components/layout/ActiveModesBar';
import { Sidebar } from './components/layout/Sidebar';
import { GraphView } from './components/graph/GraphView';
import { SidePanel } from './components/panels/SidePanel';
import { HoverTooltip } from './components/common/HoverTooltip';
import { ContextMenu, ContextAction } from './components/common/ContextMenu';
import { Toast } from './components/common/Toast';
import { Snackbar } from './components/common/Snackbar';

import {
    HelpModal,
    HotkeysModal,
    CommandPalette,
    ValidationModal,
    TopoSortModal,
    LearningPathModal,
    TourOverlay,
    EntityHierarchyModal,
    RulesModal
} from './components/modals';

const DIFF_ADDED = '#22c55e';
const DIFF_REMOVED = '#ef4444';
const LINKAGE_COLOR = '#6366a1';
const FQID_COLOR = '#4b7c6c';
const PERF_THRESHOLD = 250;

// ============ Read data once ============
const GRAPH_DATA = readGraphData();
const REMOTE_INFO = readRemoteInfo();
const REFRESH_COMMAND = readRefreshCommand();

// ============ App ============

export default function App() {
    // ============ Store ============
    const store = useGraphStore();

    // ============ One-time init ============
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;

        const initialNodes = buildInitialNodes(GRAPH_DATA);
        const initialEdges = buildInitialEdges(GRAPH_DATA);
        store.setNodes(initialNodes);
        store.setEdges(initialEdges);

        // Тема
        document.documentElement.setAttribute('data-theme', store.theme);
    }, []);

    // ============ Toast visibility ============
    const [toastVisible, setToastVisible] = React.useState(!!REMOTE_INFO?.fromCache);

    // ============ Filters/highlight ============
    const {
        displayNodes,
        displayEdges,
        filteredNodes,
        filteredEdges,
        bidirectionalEdges,
        counts,
        isolatedCount,
        filteredIdsHash
    } = useGraphFilters();

    const edgesForFocus = useMemo(() => {
        const ids = new Set(filteredNodes.map((n) => n.id));
        return displayEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }, [displayEdges, filteredNodes]);

    const highlight = useGraphHighlight(filteredEdges, edgesForFocus);

    // ============ Cycles ============
    const cyclesInfo = useMemo(
        () => findCycles(displayNodes, displayEdges),
        [displayNodes, displayEdges]
    );

    // ============ Health ============
    const healthMap = useMemo(() => {
        const map = new Map<string, any>();
        displayNodes.forEach((n) => {
            const h = computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null);
            map.set(n.id, h);
        });
        return map;
    }, [displayNodes, displayEdges, cyclesInfo]);

    // ============ Rule violations ============
    const ruleViolations = useMemo(
        () => evaluateRules(displayEdges, displayNodes, store.rules),
        [displayEdges, displayNodes, store.rules]
    );

    const violationsByEdge = useMemo(() => {
        const m = new Map<string, any[]>();
        ruleViolations.forEach((v) => {
            if (!m.has(v.edgeId)) m.set(v.edgeId, []);
            m.get(v.edgeId)!.push(v);
        });
        return m;
    }, [ruleViolations]);

    // ============ Edges for render ============
    const edgesForRender = useMemo(() => {
        if (highlight && (highlight.type === 'focus' || highlight.type === 'cycle' || highlight.type === 'path')) {
            return edgesForFocus;
        }
        return filteredEdges;
    }, [filteredEdges, edgesForFocus, highlight]);

    // ============ Heatmap values ============
    const heatmapValues = useMemo(() => {
        if (store.heatmap === 'none') return null;
        const map = new Map<string, number>();
        const values: number[] = [];
        displayNodes.forEach((n) => {
            let v = 0;
            if (store.heatmap === 'health') {
                const h = healthMap.get(n.id);
                v = h && typeof h === 'object' ? h.score || 0 : typeof h === 'number' ? h : 0;
            } else if (store.heatmap === 'degree') {
                let d = 0;
                displayEdges.forEach((e) => {
                    if (e.source === n.id) d++;
                    if (e.target === n.id) d++;
                });
                v = d;
            } else if (store.heatmap === 'entities') v = n.data.entitiesCount || 0;
            else if (store.heatmap === 'fqid') v = (n.data.fqidRefs || []).length;
            map.set(n.id, v);
            values.push(v);
        });
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 1;
        return { map, min, max, scheme: HEATMAPS[store.heatmap] };
    }, [store.heatmap, displayNodes, displayEdges, healthMap]);

    // ============ Visible nodes ============
    const visibleNodes = useMemo(() => {
        const pathEndpoints = store.pathResult
            ? new Set([
                store.pathResult.nodes[0],
                store.pathResult.nodes[store.pathResult.nodes.length - 1]
            ])
            : null;

        const hasHighlight = !!(
            highlight ||
            store.diffMode ||
            store.topoLevelMap ||
            store.validationResults ||
            heatmapValues
        );

        return filteredNodes.map((n) => {
            const h = healthMap.get(n.id);
            const healthScore = h && typeof h === 'object' ? h.score : typeof h === 'number' ? h : null;
            const healthBreakdown = h && typeof h === 'object' ? h.breakdown || [] : [];

            const topoLvl = store.topoLevelMap ? store.topoLevelMap.get(n.data.domainId) : null;
            const validation = store.validationResults
                ? store.validationResults.get(n.data.domainId)
                : null;
            const isInvalid = validation && validation.status === 'invalid';
            const isBookmarked = store.bookmarks.has(n.id);

            let heatColorValue: string | undefined;
            if (heatmapValues) {
                const v = heatmapValues.map.get(n.id) || 0;
                heatColorValue = heatColor(v, heatmapValues.min, heatmapValues.max, heatmapValues.scheme);
            }

            const baseData = {
                ...n.data,
                health: healthScore,
                healthBreakdown,
                __compact: store.compact,
                __topoLevel: topoLvl,
                __invalid: isInvalid,
                __validationStatus: validation ? validation.status : null,
                __validationDiagnostics:
                    validation && validation.diagnostics ? validation.diagnostics : [],
                __validationCount:
                    validation && validation.diagnostics ? validation.diagnostics.length : 0,
                __bookmarked: isBookmarked,
                __tooltipsEnabled: store.tooltipsEnabled,
                __heatColor: heatColorValue
            };

            if (!hasHighlight && !store.selectedNodeId && store.hiddenNodeIds.size === 0) {
                return { ...n, data: baseData, selected: false };
            }

            const dimmed = highlight && !highlight.soft ? !highlight.nodes.has(n.id) : false;
            const inPath = !!(highlight && highlight.type === 'path' && highlight.nodes.has(n.id));
            const isPathEndpoint = !!(pathEndpoints && pathEndpoints.has(n.id));
            const isAdded = !!(store.diffMode && store.diffMode.addedNodes.has(n.id));

            return {
                ...n,
                style: { opacity: dimmed ? 0.12 : 1, transition: 'opacity 0.2s' },
                data: {
                    ...baseData,
                    dimmed,
                    __inPath: inPath,
                    __isPathEndpoint: isPathEndpoint,
                    __isAdded: isAdded,
                    __selectedHighlight: !!(
                        highlight &&
                        highlight.soft &&
                        highlight.nodes.has(n.id) &&
                        n.id === store.selectedNodeId
                    )
                },
                selected: n.id === store.selectedNodeId
            };
        });
    }, [
        filteredNodes,
        highlight,
        store.compact,
        store.pathResult,
        store.diffMode,
        healthMap,
        store.selectedNodeId,
        store.topoLevelMap,
        store.validationResults,
        store.bookmarks,
        store.hiddenNodeIds,
        heatmapValues,
        store.tooltipsEnabled
    ]);

    // ============ Visible edges ============
    const visibleEdges = useMemo(() => {
        const isStrictHighlight =
            highlight &&
            (highlight.type === 'path' || highlight.type === 'cycle' || highlight.type === 'focus');

        let baseEdges = edgesForRender;
        if (isStrictHighlight) {
            baseEdges = edgesForRender.filter((e) => {
                const eid = (e.data && e.data.originalId) || e.id;
                return highlight!.edges.has(e.id) || highlight!.edges.has(eid);
            });
        }

        const hasHighlight =
            highlight ||
            store.diffMode ||
            store.selectedEdgeId ||
            (store.rulesHighlighted && violationsByEdge.size > 0);

        if (!hasHighlight) return baseEdges;

        return baseEdges.map((e) => {
            const isSelected = e.id === store.selectedEdgeId;
            const hl =
                highlight &&
                (highlight.edges.has(e.id) ||
                    (e.data && e.data.originalId && highlight.edges.has(e.data.originalId)));

            const baseColor =
                e.data && e.data.kind === 'linkage'
                    ? LINKAGE_COLOR
                    : e.data && e.data.kind === 'fqid'
                        ? FQID_COLOR
                        : LINKAGE_COLOR;

            let stroke = baseColor;
            let opacity = 0.5;
            let strokeWidth = (e.style && e.style.strokeWidth) || 1.0;
            let animated = false;

            if (highlight) {
                if (highlight.soft) {
                    if (hl) {
                        opacity = 0.9;
                        strokeWidth = e.data && e.data.kind === 'linkage' ? 2.2 : 1.8;
                    }
                } else {
                    opacity = hl ? 1 : 0.06;
                    strokeWidth = hl ? (e.data && e.data.kind === 'linkage' ? 3 : 2) : strokeWidth;
                    animated = !!hl && highlight.type === 'path';
                }
            }

            if (store.diffMode) {
                if (store.diffMode.addedEdges.has(e.id)) {
                    stroke = DIFF_ADDED;
                    opacity = 1;
                    strokeWidth = 3;
                    animated = true;
                } else if (store.diffMode.removedEdges.has(e.id)) {
                    stroke = DIFF_REMOVED;
                    opacity = 1;
                    strokeWidth = 3;
                }
            }

            if (store.rulesHighlighted && violationsByEdge.has(e.id)) {
                const v = violationsByEdge.get(e.id)!;
                const hasForbid = v.some((x) => x.severity === 'forbid');
                stroke = hasForbid ? '#dc2626' : '#f59e0b';
                opacity = 1;
                strokeWidth = 3.5;
                animated = true;
            }

            if (isSelected) {
                stroke = '#fbbf24';
                opacity = 1;
                strokeWidth = 4;
                animated = true;
            }

            return {
                ...e,
                animated,
                style: { ...e.style, stroke, opacity, strokeWidth },
                markerEnd: { ...e.markerEnd, color: stroke },
                markerStart: e.markerStart ? { ...e.markerStart, color: stroke } : undefined
            };
        });
    }, [
        edgesForRender,
        highlight,
        store.diffMode,
        store.rulesHighlighted,
        violationsByEdge,
        store.selectedEdgeId
    ]);

    // ============ Display edges (labels off in perf mode) ============
    const perfMode = useMemo(
        () => filteredEdges.length > PERF_THRESHOLD,
        [filteredEdges.length]
    );

    const displayEdgesForRender = useMemo(() => {
        const hideLabels = perfMode && !store.showEdgeLabels;
        if (!hideLabels) return visibleEdges;
        return visibleEdges.map((e) => (e.label ? { ...e } : e));
    }, [visibleEdges, perfMode, store.showEdgeLabels]);

    // ============ Layout ============
    const layoutAppliedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!filteredIdsHash) return;
        const layoutKey = `${store.layoutType}:${store.clusterDepth}:${store.compact}:${filteredIdsHash}`;
        if (layoutAppliedRef.current === layoutKey) return;
        layoutAppliedRef.current = layoutKey;

        const visibleIds = new Set(filteredNodes.map((n) => n.id));
        const layoutInput = store.nodes
            .filter((n) => visibleIds.has(n.id))
            .map((n) => ({ ...n, data: { ...n.data, __compact: store.compact } }));

        if (layoutInput.length === 0) return;

        const result = runLayout(layoutInput, filteredEdges, store.layoutType, {
            depth: store.clusterDepth
        });

        const posMap = new Map<string, { x: number; y: number }>();
        result.nodes.forEach((n) => posMap.set(n.id, n.position));

        store.setClusterBoxes(
            store.layoutType === 'cluster' || store.layoutType === 'folder' ? result.boxes : []
        );
        store.setClusterGroupCount(result.boxes.length);

        store.setNodes((prev) =>
            prev.map((n) => {
                const visible = visibleIds.has(n.id);
                const newPos = posMap.get(n.id);
                if (visible && newPos) {
                    return {
                        ...n,
                        position: newPos,
                        hidden: false,
                        width: 300,
                        height: 88
                    };
                }
                return { ...n, hidden: !visible };
            })
        );

        // Auto-fit
        setTimeout(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (store.rfInstance) {
                        try { store.rfInstance.fitView({ duration: 400, padding: 0.15 }); } catch { }
                    }
                });
            });
        }, 80);
    }, [filteredIdsHash, store.layoutType, store.clusterDepth, store.compact]);

    // ============ Initial fit ============
    useEffect(() => {
        if (store.didInitialFit) return;
        if (visibleNodes.length === 0) return;
        if (!store.rfInstance) return;

        const t = setTimeout(() => {
            if (!store.rfInstance) return;
            try {
                store.rfInstance.fitView({ duration: 0, padding: 0.2 });
                store.setDidInitialFit(true);
            } catch { }
        }, 250);
        return () => clearTimeout(t);
    }, [visibleNodes.length, store.rfInstance, store.didInitialFit]);

    // ============ Hooks ============
    useHotkeys();
    const tooltip = useTooltip();
    const { goto, gotoWithoutNav, back, forward, navStack } = useNavigation();
    const searchResults = useSearch();

    // ============ Open file ============
    const openFileInEditor = useCallback(
        (filePath: string, fqid: string | null = null) => {
            if (!filePath) return;
            store.setEditorFilePath(filePath);
            store.setPanelTab('file');
            store.setPanelOpen(true);

            fetch('/file?path=' + encodeURIComponent(filePath))
                .then((r) => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.text();
                })
                .then((content) => {
                    store.setPendingFile({ content, fqid: fqid || null, ts: Date.now() });
                })
                .catch((err) => {
                    store.setPendingFile({
                        content: '// Не удалось загрузить файл: ' + err.message,
                        fqid: null,
                        ts: Date.now()
                    });
                });
        },
        [store]
    );

    // ============ Event subscriptions (from children) ============
    useEffect(() => {
        const onFindCycles = () => {
            if (store.cycleHighlight) {
                store.setCycleHighlight(null);
                return;
            }
            const info = findCycles(displayNodes, displayEdges);
            if (info.cycleNodes.size === 0) {
                alert('Циклы не найдены');
                return;
            }
            store.setCycleHighlight({
                nodeIds: info.cycleNodes,
                edgeIds: info.cycleEdges,
                sccCount: info.sccs.length
            });
            store.setSelectedNodeId(null);
            store.setFocusNode(null);
            store.setPathResult(null);
            store.setPathSel([]);
            setTimeout(() => {
                if (store.rfInstance) {
                    try { store.rfInstance.fitView({ duration: 500, padding: 0.25 }); } catch { }
                }
            }, 50);
        };

        const onOpenFile = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            if (detail.filePath) openFileInEditor(detail.filePath, detail.fqid || null);
        };

        document.addEventListener(EVT_FIND_CYCLES, onFindCycles);
        document.addEventListener(EVT_OPEN_FILE, onOpenFile);
        return () => {
            document.removeEventListener(EVT_FIND_CYCLES, onFindCycles);
            document.removeEventListener(EVT_OPEN_FILE, onOpenFile);
        };
    }, [displayNodes, displayEdges, store, openFileInEditor]);

    // ============ Node/edge interactions ============
    const handleNodeClick = useCallback(
        (event: React.MouseEvent, node: any) => {
            tooltip.hide();

            if (store.pathMode) {
                if (!store.pathMode.anchorId) {
                    store.setPathMode({ anchorId: node.id, anchorDomainId: node.data.domainId });
                    store.setPathSel([node.id]);
                    return;
                }
                const startId = store.pathMode.anchorId;
                const endId = node.id;
                if (startId === endId) {
                    store.setPathMode(null);
                    store.setPathSel([]);
                    return;
                }
                const res = findPath(startId, endId, filteredEdges);
                if (res) {
                    store.setPathResult(res);
                    store.setPathMode(null);
                    store.setPathSel([]);
                } else {
                    alert('Путь не найден');
                    store.setPathMode(null);
                    store.setPathSel([]);
                }
                return;
            }

            store.setSelectedEdgeId(null);
            store.setPathResult(null);
            store.setPathSel([]);
            store.setSelectedNodeId(node.id);
            store.setFocusNode(null);
            store.pushNav(node.data.domainId);

            if (store.sidePanelEnabled) {
                store.setPanelNodeId(node.id);
                store.setPanelTab('details');
                store.setPanelOpen(true);
            }
        },
        [tooltip, store, filteredEdges]
    );

    const handleNodeDoubleClick = useCallback(
        (_e: React.MouseEvent, node: any) => {
            if (store.focusNode === node.id) {
                store.setFocusNode(null);
            } else {
                store.setFocusNode(node.id);
                store.setSelectedNodeId(node.id);
            }
        },
        [store]
    );

    const handleNodeContextMenu = useCallback(
        (event: React.MouseEvent, node: any) => {
            event.preventDefault();
            tooltip.hide();
            store.setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
        },
        [tooltip, store]
    );

    const handlePaneClick = useCallback(() => {
        document.dispatchEvent(new CustomEvent('close-all-popovers'));
        tooltip.hide();
        store.setSelectedNodeId(null);
        store.setSelectedEdgeId(null);
        store.setFocusNode(null);
        store.setPathResult(null);
        store.setPathSel([]);
        store.setPathMode(null);
        store.setContextMenu(null);
    }, [tooltip, store]);

    const handleContextAction = useCallback(
        (action: ContextAction, nodeId: string) => {
            const node = store.nodes.find((n) => n.id === nodeId);
            if (!node) return;

            switch (action) {
                case 'focus':
                    store.setFocusNode(nodeId);
                    store.setSelectedNodeId(null);
                    break;
                case 'dependents':
                    store.setFocusNode(nodeId);
                    store.setFocusDepth(3);
                    break;
                case 'path-from':
                    store.setPathMode({ kind: 'from', anchorId: nodeId });
                    store.setPathSel([]);
                    store.setPathResult(null);
                    break;
                case 'path-to':
                    store.setPathMode({ kind: 'to', anchorId: nodeId });
                    store.setPathSel([]);
                    store.setPathResult(null);
                    break;
                case 'open-file':
                    if (node.data.filePath) openFileInEditor(node.data.filePath);
                    break;
                case 'copy-id':
                    navigator.clipboard.writeText(node.data.domainId);
                    break;
                case 'hide':
                    store.hideNode(nodeId);
                    break;
                case 'bookmark':
                    store.toggleBookmark(nodeId);
                    break;
            }
        },
        [store, openFileInEditor]
    );

    const handleEdgeClick = useCallback(
        (_e: React.MouseEvent, edge: any) => {
            const realId = (edge.data && edge.data.originalId) || edge.id;
            store.setSelectedEdgeId(realId);
            if (store.sidePanelEnabled) {
                store.setPanelTab('edge');
                store.setPanelOpen(true);
            }
            tooltip.hide();
        },
        [store, tooltip]
    );

    // ============ Tooltips on hover ============
    const handleNodeMouseEnter = useCallback(
        (event: React.MouseEvent, node: any) => {
            if (!store.tooltipsEnabled) return;
            if (store.pathSel.length > 0 || store.pathMode) return;
            const curZoom = store.rfInstance ? store.rfInstance.getZoom() : 1;
            if (curZoom < 0.15) return;

            // HTML тултипа формируется в App, т.к. требует healthMap/validation
            tooltip.showForNode(node.id, () => buildNodeTooltip(node, store, healthMap), event);
        },
        [tooltip, store, healthMap]
    );

    const handleEdgeMouseEnter = useCallback(
        (event: React.MouseEvent, edge: any) => {
            if (!store.tooltipsEnabled) return;
            if (store.pathSel.length > 0 || store.pathMode) return;
            const refs = (edge.data && edge.data.fqidRefs) || [];
            tooltip.showForNode('edge:' + edge.id, () => buildEdgeTooltip(edge, refs), event);
        },
        [tooltip, store]
    );

    // ============ Navigation handler for events ============
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail && detail.domainId) goto(detail.domainId);
        };
        document.addEventListener('dg:goto', handler);
        return () => document.removeEventListener('dg:goto', handler);
    }, [goto]);

    // ============ Export handlers ============
    const handleExportJSON = useCallback(
        () => exportGraphJSON(store.nodes, store.edges),
        [store.nodes, store.edges]
    );

    const handleExportMarkdown = useCallback(() => {
        const md = generateMarkdownReport({
            nodes: store.nodes,
            edges: store.edges,
            cyclesInfo,
            healthMap,
            namespaceFilter: store.namespaceFilter,
            filters: store.filters as unknown as Record<string, boolean>
        });
        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'domain-report-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md';
        a.click();
        URL.revokeObjectURL(url);
    }, [store.nodes, store.edges, cyclesInfo, healthMap, store.namespaceFilter, store.filters]);

    const handleExportPNG = useCallback(() => {
        exportPNG();
    }, []);

    const handleExportMermaid = useCallback(() => {
        exportMermaid(visibleNodes, visibleEdges);
    }, [visibleNodes, visibleEdges]);

    const handleExportStats = useCallback(() => {
        exportStatsMarkdown(
            store.nodes,
            store.edges,
            counts,
            isolatedCount,
            cyclesInfo.sccs.length,
            sidebarTopConnectedRef.current,
            sidebarWorstHealthRef.current,
            sidebarNamespacesRef.current,
            sidebarTagCloudRef.current
        );
    }, [store.nodes, store.edges, counts, isolatedCount, cyclesInfo.sccs.length]);

    // ============ Snapshots ============
    const handleSaveSnapshot = useCallback(
        (slot: 'A' | 'B') => {
            const snap = createSnapshot(store.nodes, store.edges, REMOTE_INFO?.server || null);
            if (slot === 'A') store.setSnapshotA(snap);
            else store.setSnapshotB(snap);
            store.showSnackbar(
                `Снимок сохранён в ${slot} (${snap.stats.nodes} узлов, ${snap.stats.edges} связей)`
            );
        },
        [store]
    );

    const applySnapshotDiff = useCallback(
        (snap: Snapshot) => {
            const diff = computeDiff(store.nodes, store.edges, snap);
            if (!diff) {
                alert('Снимок некорректен');
                return;
            }
            store.setDiffMode({ ...diff, snapshot: snap });
        },
        [store]
    );

    const handleLoadSnapshot = useCallback(
        (slot: 'A' | 'B') => {
            const snap = slot === 'A' ? store.snapshotA : store.snapshotB;
            if (!snap) return;
            applySnapshotDiff(snap);
            store.showSnackbar(
                `Сравнение со снимком ${slot} от ` +
                new Date(snap.savedAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                })
            );
        },
        [store, applySnapshotDiff]
    );

    const handleClearSnapshot = useCallback(
        (slot: 'A' | 'B') => {
            if (!confirm('Удалить снимок ' + slot + '?')) return;
            if (slot === 'A') store.setSnapshotA(null);
            else store.setSnapshotB(null);
        },
        [store]
    );

    const handleSnapshotUpload = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const snap = JSON.parse(ev.target?.result as string);
                    applySnapshotDiff(snap);
                    store.showSnackbar('Сравнение с загруженным файлом');
                } catch (err: any) {
                    alert('Ошибка чтения снимка: ' + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        },
        [applySnapshotDiff, store]
    );

    // ============ Topo levels & tour ============
    const startTour = useCallback(
        (path: any) => {
            store.setTour({
                stages: path.stages,
                index: 0,
                playing: false,
                startedAt: Date.now()
            });
            store.setSelectedNodeId(null);
            store.setFocusNode(null);
            store.setCycleHighlight(null);
            store.setPathResult(null);
            store.setPathSel([]);
        },
        [store]
    );

    // ============ Sidebar refs — для экспорта статистики ============
    // Мы их подхватываем напрямую из данных
    const sidebarTopConnectedRef = useRef<any[]>([]);
    const sidebarWorstHealthRef = useRef<any[]>([]);
    const sidebarNamespacesRef = useRef<Array<[string, number]>>([]);
    const sidebarTagCloudRef = useRef<Array<[string, number]>>([]);

    // Пересчитываем чтобы экспорт имел актуальные данные
    React.useEffect(() => {
        const deg = new Map<string, number>();
        store.nodes.forEach((n) => deg.set(n.id, 0));
        store.edges.forEach((e) => {
            if (deg.has(e.source)) deg.set(e.source, deg.get(e.source)! + 1);
            if (deg.has(e.target)) deg.set(e.target, deg.get(e.target)! + 1);
        });
        sidebarTopConnectedRef.current = store.nodes
            .map((n) => ({ node: n, degree: deg.get(n.id) || 0 }))
            .filter((x) => x.degree > 0)
            .sort((a, b) => b.degree - a.degree)
            .slice(0, 5);

        sidebarWorstHealthRef.current = store.nodes
            .filter((n) => n.data.nodeType === 'domain')
            .map((n) => {
                const h = healthMap.get(n.id);
                const score = h && typeof h === 'object' ? h.score : typeof h === 'number' ? h : 0;
                return { node: n, health: score };
            })
            .sort((a, b) => a.health - b.health)
            .slice(0, 5);

        const nsMap = new Map<string, number>();
        store.nodes.forEach((n) => {
            if (n.data.nodeType !== 'domain') return;
            const ns = n.data.domainId.split('.').slice(0, 2).join('.');
            nsMap.set(ns, (nsMap.get(ns) || 0) + 1);
        });
        sidebarNamespacesRef.current = Array.from(nsMap.entries()).sort((a, b) => b[1] - a[1]);

        const tagMap = new Map<string, number>();
        store.nodes.forEach((n) => {
            (n.data.tags || []).forEach((t) => tagMap.set(String(t), (tagMap.get(String(t)) || 0) + 1));
        });
        sidebarTagCloudRef.current = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
    }, [store.nodes, store.edges, healthMap]);

    // ============ Domain lists for modals ============
    const allDomainsList = useMemo(
        () =>
            store.nodes
                .filter((n) => n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [store.nodes]
    );
    const visibleDomainsList = useMemo(
        () =>
            visibleNodes
                .filter((n) => n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [visibleNodes]
    );
    const bookmarkedDomainsList = useMemo(
        () =>
            store.nodes
                .filter((n) => store.bookmarks.has(n.id) && n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [store.nodes, store.bookmarks]
    );

    // ============ Commands for palette ============
    const commands = useMemo(
        () =>
            buildCommands({
                theme: store.theme,
                setTheme: store.setTheme,
                compact: store.compact,
                setCompact: store.setCompact,
                showGroups: store.showGroups,
                setShowGroups: store.setShowGroups,
                bidirectional: store.bidirectional,
                setBidirectional: store.setBidirectional,
                showEdgeLabels: store.showEdgeLabels,
                setShowEdgeLabels: store.setShowEdgeLabels,
                tooltipsEnabled: store.tooltipsEnabled,
                setTooltipsEnabled: store.setTooltipsEnabled,
                heatmap: store.heatmap,
                setHeatmap: store.setHeatmap,
                isolatedOnly: store.isolatedOnly,
                setIsolatedOnly: store.setIsolatedOnly,
                nsMode: store.nsMode,
                setNsMode: store.setNsMode,
                focusNode: store.focusNode,
                setFocusNode: store.setFocusNode,
                selectedNodeId: store.selectedNodeId,
                bookmarksOnly: store.bookmarksOnly,
                setBookmarksOnly: store.setBookmarksOnly,
                onlyInvalid: store.onlyInvalid,
                setOnlyInvalid: store.setOnlyInvalid,
                validationAvailable: store.validationAvailable,
                setLayoutType: store.setLayoutType,
                setTopoOpen: store.setTopoOpen,
                setLearningPathOpen: store.setLearningPathOpen,
                setEntityHierarchyOpen: store.setEntityHierarchyOpen,
                setHelpOpen: store.setHelpOpen,
                setHotkeysOpen: store.setHotkeysOpen,
                setValidationOpen: store.setValidationOpen,
                tour: store.tour,
                tourStop: () => store.setTour(null),
                rfInstance: store.rfInstance,
                navBack: back,
                navForward: forward,
                handleFindCycles: () => document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES)),
                handleRunPath: () => {
                    if (store.pathSel.length === 2) {
                        const res = findPath(store.pathSel[0], store.pathSel[1], filteredEdges);
                        if (res) store.setPathResult(res);
                        else alert('Путь не найден');
                    } else {
                        store.setPathMode({ anchorId: null });
                        store.setPathSel([]);
                        store.setPathResult(null);
                    }
                },
                handleExportJSON,
                handleExportMarkdown,
                handleExportPNG,
                resetAll: store.resetAll,
                setFilters: store.setFilters,
                setNamespaceFilter: store.setNamespaceFilter,
                setTagFilters: store.setTagFilters,
                resetHiddenNodes: store.resetHiddenNodes,
                setEntityHierarchyInitialKey: store.setEntityHierarchyInitialKey
            }),
        [
            store.theme, store.compact, store.showGroups, store.bidirectional, store.showEdgeLabels,
            store.tooltipsEnabled, store.heatmap, store.isolatedOnly, store.nsMode, store.focusNode,
            store.selectedNodeId, store.bookmarksOnly, store.onlyInvalid, store.validationAvailable,
            store.tour, store.rfInstance, store.pathSel, filteredEdges,
            back, forward, handleExportJSON, handleExportMarkdown, handleExportPNG
        ]
    );

    // ============ Active filters count ============
    const activeFiltersCount = useMemo(() => {
        let c = 0;
        const f = store.filters;
        if (!f.domain) c++;
        if (!f.missing) c++;
        if (!f.broken) c++;
        if (!f.linkage) c++;
        if (!f.fqid) c++;
        if (store.namespaceFilter.trim()) c++;
        if (store.tagFilters.size > 0) c++;
        if (store.isolatedOnly) c++;
        if (store.bookmarksOnly) c++;
        if (store.onlyInvalid) c++;
        if (store.hiddenNodeIds.size > 0) c++;
        return c;
    }, [
        store.filters, store.namespaceFilter, store.tagFilters,
        store.isolatedOnly, store.bookmarksOnly, store.onlyInvalid, store.hiddenNodeIds
    ]);

    // ============ Entity index ============
    const entityIndex = useMemo(
        () => buildEntityIndex(GRAPH_DATA.entities || []),
        []
    );

    // ============ onRelayout ============
    const handleRelayout = useCallback(() => {
        layoutAppliedRef.current = null;
        const visibleIds = new Set(filteredNodes.map((n) => n.id));
        const layoutInput = store.nodes
            .filter((n) => visibleIds.has(n.id))
            .map((n) => ({ ...n, data: { ...n.data, __compact: store.compact } }));

        const result = runLayout(layoutInput, filteredEdges, store.layoutType, {
            depth: store.clusterDepth
        });
        store.setNodes(result.nodes);
        store.setClusterBoxes(
            store.layoutType === 'cluster' || store.layoutType === 'folder' ? result.boxes : []
        );
        setTimeout(() => {
            if (store.rfInstance) {
                try { store.rfInstance.fitView({ duration: 500 }); } catch { }
            }
        }, 100);
    }, [store, filteredNodes, filteredEdges]);

    const handleResetAll = useCallback(() => {
        store.resetAll();
        layoutAppliedRef.current = null;
        setTimeout(() => {
            if (store.rfInstance) {
                try { store.rfInstance.fitView({ duration: 500, padding: 0.15 }); } catch { }
            }
        }, 200);
    }, [store]);

    // ============ Render ============
    const panelNode = store.panelNodeId
        ? visibleNodes.find((n) => n.id === store.panelNodeId) ||
        store.nodes.find((n) => n.id === store.panelNodeId)
        : null;

    const panelEdge = store.selectedEdgeId
        ? displayEdgesForRender.find((e) => e.id === store.selectedEdgeId) ||
        store.edges.find((e) => e.id === store.selectedEdgeId)
        : null;

    return (
        <div className="app">
            <Sidebar
                healthMap={healthMap}
                cyclesCount={cyclesInfo.sccs.length}
                cacheDiff={GRAPH_DATA.cacheDiff || null}
                onFitView={() => {
                    if (store.rfInstance) {
                        try { store.rfInstance.fitView({ duration: 500, padding: 0.15 }); } catch { }
                    }
                }}
                onExportStats={handleExportStats}
            />

            <main className="main">
                <Toolbar
                    counts={counts}
                    visibleNodesCount={visibleNodes.length}
                    visibleEdgesCount={visibleEdges.length}
                    totalNodesCount={store.nodes.length}
                    totalEdgesCount={store.edges.length}
                    activeFiltersCount={activeFiltersCount}
                    remoteInfo={REMOTE_INFO}
                    cycleHighlight={store.cycleHighlight}
                    ruleViolationsCount={ruleViolations.length}
                    onFindCycles={() => document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES))}
                    onStartPathFinder={() => {
                        store.setPathMode({ anchorId: null });
                        store.setPathSel([]);
                        store.setPathResult(null);
                    }}
                    onOpenTopo={() => store.setTopoOpen(true)}
                    onOpenLearningPath={() => store.setLearningPathOpen(true)}
                    onOpenRules={() => store.setRulesOpen(true)}
                    onOpenEntityHierarchy={() => {
                        store.setEntityHierarchyInitialKey(null);
                        store.setEntityHierarchyOpen(true);
                    }}
                    onOpenValidation={() => store.setValidationOpen(true)}
                    onExportJSON={handleExportJSON}
                    onExportMarkdown={handleExportMarkdown}
                    onExportPNG={handleExportPNG}
                    onExportMermaid={handleExportMermaid}
                    onSaveSnapshot={handleSaveSnapshot}
                    onLoadSnapshot={handleLoadSnapshot}
                    onClearSnapshot={handleClearSnapshot}
                    onSnapshotUpload={handleSnapshotUpload}
                    onApplyLayout={handleRelayout}
                    onResetAll={handleResetAll}
                    onRelayout={handleRelayout}
                    onShowToast={() => setToastVisible(true)}
                />

                <ActiveModesBar ruleViolationsCount={ruleViolations.length} />

                <div className={'graph-container' + (store.showEdgeLabels ? ' show-labels' : '')}>
                    <GraphView
                        nodes={visibleNodes}
                        edges={displayEdgesForRender}
                        onNodesChange={(changes) =>
                            store.setNodes((prev) => applyNodeChanges(changes, prev) as unknown as RFNode[])
                        }
                        onEdgesChange={(changes) =>
                            store.setEdges((prev) => applyEdgeChanges(changes, prev) as unknown as RFEdge[])
                        }
                        onNodeClick={handleNodeClick}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        onNodeContextMenu={handleNodeContextMenu}
                        onNodeMouseEnter={handleNodeMouseEnter}
                        onNodeMouseLeave={tooltip.scheduleHide}
                        onEdgeClick={handleEdgeClick}
                        onEdgeMouseEnter={handleEdgeMouseEnter}
                        onEdgeMouseLeave={tooltip.scheduleHide}
                        onPaneClick={handlePaneClick}
                        onPaneContextMenu={(e) => e.preventDefault()}
                        showGroups={store.showGroups}
                        clusterBoxes={store.clusterBoxes}
                        perfMode={perfMode}
                    />

                    {visibleNodes.length === 0 && (
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
                                    <button className="btn" onClick={() => store.setNamespaceFilter('')}>
                                        Сбросить namespace
                                    </button>
                                )}
                                {store.tagFilters.size > 0 && (
                                    <button className="btn" onClick={() => store.setTagFilters(new Set())}>
                                        Сбросить теги
                                    </button>
                                )}
                                <button className="btn btn--primary" onClick={handleResetAll}>
                                    Сбросить всё
                                </button>
                            </div>
                        </div>
                    )}

                    {store.heatmap !== 'none' && heatmapValues && (
                        <div className="heat-legend">
                            <div className="heat-legend__title">
                                Heatmap: {heatmapValues.scheme.label}
                            </div>
                            <div className="heat-legend__bar" />
                            <div className="heat-legend__labels">
                                <span>{heatmapValues.min}</span>
                                <span>{heatmapValues.max}</span>
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
                        entities={GRAPH_DATA.entities || []}
                        entityIndex={entityIndex}
                        ruleViolations={ruleViolations}
                        onOpenEntityHierarchy={(key) => {
                            store.setEntityHierarchyInitialKey(key);
                            store.setEntityHierarchyOpen(true);
                        }}
                    />
                </div>
            </main>

            <HoverTooltip />

            <CommandPalette
                commands={commands}
                onOpenFile={(filePath, fqid) => openFileInEditor(filePath, fqid)}
            />

            <HelpModal open={store.helpOpen} onClose={() => store.setHelpOpen(false)} />
            <HotkeysModal open={store.hotkeysOpen} onClose={() => store.setHotkeysOpen(false)} />

            <ValidationModal
                allDomains={allDomainsList}
                visibleDomains={visibleDomainsList}
                bookmarkedDomains={bookmarkedDomainsList}
            />

            <TopoSortModal
                allDomains={allDomainsList}
                visibleDomains={visibleDomainsList}
                bookmarkedDomains={bookmarkedDomainsList}
            />

            <LearningPathModal
                visibleDomains={visibleDomainsList}
                bookmarkedDomains={bookmarkedDomainsList}
                onStartTour={startTour}
            />

            <TourOverlay />

            <EntityHierarchyModal entities={GRAPH_DATA.entities || []} />

            <RulesModal violations={ruleViolations} />

            <ContextMenu
                menu={store.contextMenu}
                onClose={() => store.setContextMenu(null)}
                onAction={handleContextAction}
            />

            {toastVisible && REMOTE_INFO?.fromCache && (
                <Toast
                    message={
                        '📦 Граф построен из <b>кэша</b>' +
                        (REMOTE_INFO.fetchedAt
                            ? ' (от ' + new Date(REMOTE_INFO.fetchedAt).toLocaleString('ru-RU') + ')'
                            : '') +
                        '. Данные могут быть устаревшими.'
                    }
                    actions={REFRESH_COMMAND ? [{ command: REFRESH_COMMAND }] : []}
                    duration={15000}
                    onClose={() => setToastVisible(false)}
                />
            )}

            <Snackbar snackbar={store.snackbar} />
        </div>
    );
}

// ============ Tooltip builders ============

function buildNodeTooltip(node: any, store: any, healthMap: Map<string, any>): string {
    const d = node.data;
    const typeLabel =
        d.nodeType === 'domain'
            ? 'Корректный домен'
            : d.nodeType === 'missing'
                ? 'Несуществующий домен'
                : 'Битый YAML';
    const typeColor = d.nodeType === 'domain' ? '#10b981' : d.nodeType === 'missing' ? '#f59e0b' : '#ef4444';

    let html = `<div class="tooltip__header" style="color:${typeColor}">${escapeHtml(typeLabel)}</div>`;
    html += '<div class="tooltip__body">';
    html += `<div class="tooltip__row"><span class="tooltip__label">ID:</span><span class="tooltip__value">${escapeHtml(d.domainId)}</span></div>`;
    if (d.label && d.label !== d.domainId) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Название:</span><span class="tooltip__value">${escapeHtml(d.label)}</span></div>`;
    }
    if (d.version) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Версия:</span><span class="tooltip__value">${escapeHtml(d.version)}</span></div>`;
    }
    if (d.entitiesCount != null) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Entities:</span><span class="tooltip__value">${d.entitiesCount}</span></div>`;
    }
    if (d.description) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Описание:</span><span class="tooltip__value">${escapeHtml(d.description)}</span></div>`;
    }
    if (d.tags && d.tags.length > 0) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Теги:</span><span class="tooltip__value">${d.tags.map(escapeHtml).join(', ')}</span></div>`;
    }
    if (d.filePath) {
        html += `<div class="tooltip__row"><span class="tooltip__label">Файл:</span><span class="tooltip__value" style="font-size:11px">${escapeHtml(d.filePath)}</span></div>`;
        html += `<div style="margin-top:10px"><button class="tooltip__btn js-open-file" data-file="${escapeHtml(d.filePath)}">📂 Открыть файл</button></div>`;
    }
    const refs = d.fqidRefs || [];
    if (refs.length > 0) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
        html += `<div class="tooltip__label" style="margin-bottom:8px">FQID ссылки (${refs.length}):</div>`;
        html += '<div class="tooltip__fqid-list">';
        refs.forEach((ref: any) => {
            html += '<div class="tooltip__ref">';
            html += `<div class="tooltip__fqid js-goto-domain" data-domain="${escapeHtml(ref.targetDomainId || '')}" style="cursor:pointer">${escapeHtml(ref.fullFQID)}</div>`;
            html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
            html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(ref.filePath || '')}" data-fqid="${escapeHtml(ref.fullFQID || '')}">📂 Открыть</button>`;
            html += '</div>';
        });
        html += '</div></div>';
    }
    html += '</div>';
    return html;
}

function buildEdgeTooltip(edge: any, refs: any[]): string {
    const fullLabel = (edge.data && edge.data.fullLabel) || edge.label || edge.id;
    const link = (edge.data && edge.data.linkData) || {};
    const nameFrom = link.nameFrom || {};
    const side1Text = nameFrom.side1 || link.sourceEntity || null;
    const side2Text = nameFrom.side2 || link.targetEntity || null;
    const side1Domain = edge.data && edge.data.side1Domain;
    const side2Domain = edge.data && edge.data.side2Domain;

    function renderSide(labelText: string, text: string, domain: string): string {
        if (!text) return '';
        const clickable = !!domain;
        let h = `<div class="tooltip__row"><span class="tooltip__label">${labelText}</span>`;
        if (clickable) {
            h += `<span class="tooltip__value js-goto-domain" data-domain="${escapeHtml(domain)}" style="cursor:pointer;color:var(--accent-hover);text-decoration:underline dotted">${escapeHtml(text)}</span>`;
        } else {
            h += `<span class="tooltip__value" style="color:var(--text-400)">${escapeHtml(text)}</span>`;
        }
        return h + '</div>';
    }

    let html = `<div class="tooltip__header">Связь: ${escapeHtml(fullLabel)}</div>`;
    html += '<div class="tooltip__body">';
    html += renderSide('Сторона 1:', side1Text, side1Domain);
    html += renderSide('Сторона 2:', side2Text, side2Domain);
    if (refs.length > 0) {
        html += `<div class="tooltip__label" style="margin-top:8px;margin-bottom:8px">FQID ссылки (${refs.length}):</div>`;
        html += '<div class="tooltip__fqid-list">';
        refs.forEach((ref: any) => {
            html += '<div class="tooltip__ref">';
            html += `<div class="tooltip__fqid">${escapeHtml(ref.fullFQID)}</div>`;
            if (ref.propertyPath) {
                html += `<div class="tooltip__path">${escapeHtml(ref.propertyPath)}</div>`;
            }
            html += `<button class="tooltip__btn js-open-file" data-file="${escapeHtml(ref.filePath || '')}" data-fqid="${escapeHtml(ref.fullFQID || '')}">📂 Открыть</button>`;
            html += '</div>';
        });
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function escapeHtml(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => {
        const map: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return map[c];
    });
}