import React, { useCallback, useEffect, useMemo, useRef } from 'react';

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
    useHeatmapValues,
    useVisibleNodes,
    useVisibleEdges,
    useHotkeys,
    useTooltip,
    useNavigation,
    useCommands,
    useSnapshots,
    useExports,
    useInitialFit,
    useGraphEvents,
    useNodeInteractions,
    useGraphLayout,
    useGlobalClickDelegation
} from './hooks';

import { findCycles } from './lib/algorithms/cycles';
import { computeHealth } from './lib/health';
import { evaluateRules } from './lib/rules';
import { buildEntityIndex } from './lib/entities';
import { EVT_FIND_CYCLES } from './lib/events';

import { Toolbar } from './components/layout/Toolbar';
import { Sidebar } from './components/layout/Sidebar';
import { GraphArea } from './components/layout/GraphArea';
import { AppModals } from './components/layout/AppModals';

const GRAPH_DATA = readGraphData();
const REMOTE_INFO = readRemoteInfo();
const REFRESH_COMMAND = readRefreshCommand();
const PERF_THRESHOLD = 250;

export default function App() {
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);
    const rules = useGraphStore((s) => s.rules);
    const viewMode = useGraphStore((s) => s.viewMode);

    // ============ Инициализация (однократно) ============
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;

        const st = useGraphStore.getState();
        st.setNodes(buildInitialNodes(GRAPH_DATA));
        st.setEdges(buildInitialEdges(GRAPH_DATA));
        document.documentElement.setAttribute('data-theme', st.theme);
    }, []);

    const CACHE_TOAST_KEY = REMOTE_INFO?.server
        ? `dg-cache-toast-hidden:${REMOTE_INFO.server.replace(/\/+$/, '')}`
        : null;

    const [toastVisible, setToastVisible] = React.useState(() => {
        if (!REMOTE_INFO?.fromCache) return false;
        if (!CACHE_TOAST_KEY) return true;
        try {
            return localStorage.getItem(CACHE_TOAST_KEY) !== '1';
        } catch {
            return true;
        }
    });

    const [dontShowCacheToast, setDontShowCacheToast] = React.useState(false);

    const handleDontShowCacheToast = React.useCallback(
        (checked: boolean) => {
            setDontShowCacheToast(checked);
            if (!CACHE_TOAST_KEY) return;
            try {
                if (checked) localStorage.setItem(CACHE_TOAST_KEY, '1');
                else localStorage.removeItem(CACHE_TOAST_KEY);
            } catch { }
        },
        [CACHE_TOAST_KEY]
    );

    // ============ Фильтры/подсветка ============
    const {
        displayNodes,
        displayEdges,
        filteredNodes,
        filteredEdges,
        counts,
        isolatedCount,
        filteredIdsHash
    } = useGraphFilters();

    const edgesForFocus = useMemo(() => {
        const ids = new Set(filteredNodes.map((n) => n.id));
        return displayEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }, [displayEdges, filteredNodes]);

    const highlight = useGraphHighlight(filteredEdges, edgesForFocus);

    // ============ Циклы ============
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
        () => evaluateRules(displayEdges, displayNodes, rules),
        [displayEdges, displayNodes, rules]
    );

    const violationsByEdge = useMemo(() => {
        const m = new Map<string, any[]>();
        ruleViolations.forEach((v) => {
            if (!m.has(v.edgeId)) m.set(v.edgeId, []);
            m.get(v.edgeId)!.push(v);
        });
        return m;
    }, [ruleViolations]);

    // ============ Рёбра для рендера ============
    const edgesForRender = useMemo(() => {
        if (
            highlight &&
            (highlight.type === 'focus' || highlight.type === 'cycle' || highlight.type === 'path')
        ) {
            return edgesForFocus;
        }
        return filteredEdges;
    }, [filteredEdges, edgesForFocus, highlight]);

    // ============ Heatmap ============
    const heatmapValues = useHeatmapValues(displayNodes, displayEdges, healthMap);

    // ============ Видимые узлы/рёбра ============
    const visibleNodes = useVisibleNodes(filteredNodes, highlight, healthMap, heatmapValues);
    const visibleEdges = useVisibleEdges(edgesForRender, highlight, violationsByEdge);

    // ============ Perf mode ============
    const perfMode = useMemo(
        () => filteredEdges.length > PERF_THRESHOLD,
        [filteredEdges.length]
    );

    const showEdgeLabels = useGraphStore((s) => s.showEdgeLabels);

    const displayEdgesForRender = useMemo(() => {
        const hideLabels = perfMode && !showEdgeLabels;
        if (!hideLabels) return visibleEdges;
        return visibleEdges.map((e) => (e.label ? { ...e } : e));
    }, [visibleEdges, perfMode, showEdgeLabels]);

    // ============ Хуки верхнего уровня ============
    useHotkeys();
    const tooltip = useTooltip();
    const { goto, back, forward } = useNavigation();

    const snapshots = useSnapshots(REMOTE_INFO?.server || null);

    const exportsApi = useExports({
        visibleNodes,
        visibleEdges,
        counts,
        isolatedCount,
        cyclesCount: cyclesInfo.sccs.length,
        healthMap,
        cyclesInfo
    });

    const commands = useCommands({
        filteredEdges,
        navBack: back,
        navForward: forward,
        onExportJSON: exportsApi.exportJSON,
        onExportMarkdown: exportsApi.exportMarkdown,
        onExportPNG: exportsApi.exportPNGFile
    });

    const { relayout, invalidate: invalidateLayout } = useGraphLayout({
        filteredNodes,
        filteredEdges,
        filteredIdsHash
    });

    useInitialFit(visibleNodes.length);

    const interactions = useNodeInteractions({ filteredEdges });

    useGraphEvents({ displayNodes, displayEdges });
    useGlobalClickDelegation(goto, tooltip.hide);

    // ============ Reset ============
    const handleResetAll = useCallback(() => {
        useGraphStore.getState().resetAll();
        invalidateLayout();
        setTimeout(() => {
            const rf = useGraphStore.getState().rfInstance;
            if (rf) {
                try {
                    rf.fitView({ duration: 500, padding: 0.15 });
                } catch { }
            }
        }, 200);
    }, [invalidateLayout]);

    // ============ Tour ============
    const startTour = useCallback((path: any) => {
        const st = useGraphStore.getState();
        st.setTour({
            stages: path.stages,
            index: 0,
            playing: false,
            startedAt: Date.now()
        });
        st.setSelectedNodeId(null);
        st.setFocusNode(null);
        st.setCycleHighlight(null);
        st.setPathResult(null);
        st.setPathSel([]);
    }, []);

    // ============ Списки доменов для модалок ============
    const allDomainsList = useMemo(
        () =>
            nodes
                .filter((n) => n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [nodes]
    );

    const visibleDomainsList = useMemo(
        () =>
            visibleNodes
                .filter((n) => n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [visibleNodes]
    );

    const bookmarks = useGraphStore((s) => s.bookmarks);

    const bookmarkedDomainsList = useMemo(
        () =>
            nodes
                .filter((n) => bookmarks.has(n.id) && n.data.nodeType === 'domain')
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [nodes, bookmarks]
    );

    const entityIndex = useMemo(() => buildEntityIndex(GRAPH_DATA.entities || []), []);

    // ============ activeFiltersCount ============
    const filters = useGraphStore((s) => s.filters);
    const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
    const tagFilters = useGraphStore((s) => s.tagFilters);
    const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
    const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
    const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
    const hiddenNodeIds = useGraphStore((s) => s.hiddenNodeIds);

    const activeFiltersCount = useMemo(() => {
        let c = 0;
        if (!filters.domain) c++;
        if (!filters.missing) c++;
        if (!filters.broken) c++;
        if (!filters.linkage) c++;
        if (!filters.fqid) c++;
        if (namespaceFilter.trim()) c++;
        if (tagFilters.size > 0) c++;
        if (isolatedOnly) c++;
        if (bookmarksOnly) c++;
        if (onlyInvalid) c++;
        if (hiddenNodeIds.size > 0) c++;
        return c;
    }, [
        filters,
        namespaceFilter,
        tagFilters,
        isolatedOnly,
        bookmarksOnly,
        onlyInvalid,
        hiddenNodeIds
    ]);

    // ============ Рендер ============
    return (
        <div className="app">
            <Sidebar
                healthMap={healthMap}
                cyclesCount={cyclesInfo.sccs.length}
                cacheDiff={GRAPH_DATA.cacheDiff || null}
                onFitView={() => {
                    const rf = useGraphStore.getState().rfInstance;
                    if (rf) {
                        try {
                            rf.fitView({ duration: 500, padding: 0.15 });
                        } catch { }
                    }
                }}
                onExportStats={exportsApi.exportStats}
            />

            <main className="main">
                <Toolbar
                    counts={counts}
                    visibleNodesCount={visibleNodes.length}
                    visibleEdgesCount={visibleEdges.length}
                    totalNodesCount={nodes.length}
                    totalEdgesCount={edges.length}
                    activeFiltersCount={activeFiltersCount}
                    remoteInfo={REMOTE_INFO}
                    cycleHighlight={useGraphStore.getState().cycleHighlight}
                    ruleViolationsCount={ruleViolations.length}
                    onFindCycles={() => document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES))}
                    onStartPathFinder={() => {
                        const st = useGraphStore.getState();
                        st.setPathMode({ anchorId: null });
                        st.setPathSel([]);
                        st.setPathResult(null);
                    }}
                    onOpenTopo={() => useGraphStore.getState().setTopoOpen(true)}
                    onOpenLearningPath={() => useGraphStore.getState().setLearningPathOpen(true)}
                    onOpenRules={() => useGraphStore.getState().setRulesOpen(true)}
                    onOpenEntityHierarchy={() => {
                        const st = useGraphStore.getState();
                        st.setEntityHierarchyInitialKey(null);
                        st.setEntityHierarchyOpen(true);
                    }}
                    onOpenValidation={() => useGraphStore.getState().setValidationOpen(true)}
                    onExportJSON={exportsApi.exportJSON}
                    onExportMarkdown={exportsApi.exportMarkdown}
                    onExportPNG={exportsApi.exportPNGFile}
                    onExportMermaid={exportsApi.exportMermaidFile}
                    onSaveSnapshot={snapshots.save}
                    onLoadSnapshot={snapshots.load}
                    onClearSnapshot={snapshots.clear}
                    onSnapshotUpload={snapshots.upload}
                    onApplyLayout={relayout}
                    onResetAll={handleResetAll}
                    onRelayout={relayout}
                    onShowToast={() => setToastVisible(true)}
                />

                <GraphArea
                    visibleNodes={visibleNodes}
                    visibleEdges={visibleEdges}
                    displayEdgesForRender={displayEdgesForRender}
                    perfMode={perfMode}
                    heatmapValues={heatmapValues}
                    interactions={interactions}
                    entities={GRAPH_DATA.entities || []}
                    entityIndex={entityIndex}
                    ruleViolations={ruleViolations}
                    onOpenEntityHierarchy={(key) => {
                        const st = useGraphStore.getState();
                        st.setEntityHierarchyInitialKey(key);
                        st.setEntityHierarchyOpen(true);
                    }}
                    onResetAll={handleResetAll}
                />
            </main>

            <AppModals
                commands={commands}
                entities={GRAPH_DATA.entities || []}
                allDomains={allDomainsList}
                visibleDomains={visibleDomainsList}
                bookmarkedDomains={bookmarkedDomainsList}
                ruleViolations={ruleViolations}
                onStartTour={startTour}
                onContextAction={interactions.handleContextAction}
                remoteInfo={REMOTE_INFO}
                refreshCommand={REFRESH_COMMAND}
                toastVisible={toastVisible}
                onToastClose={useCallback(() => setToastVisible(false), [])}
                showDontShowAgain={!!CACHE_TOAST_KEY}
                dontShowCacheToast={dontShowCacheToast}
                onDontShowCacheToastChange={handleDontShowCacheToast}
            />
        </div>
    );
}