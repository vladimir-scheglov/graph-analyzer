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
import { ActiveModesBar } from './components/layout/ActiveModesBar';
import { Sidebar } from './components/layout/Sidebar';
import { GraphArea } from './components/layout/GraphArea';
import { AppModals } from './components/layout/AppModals';

const GRAPH_DATA = readGraphData();
const REMOTE_INFO = readRemoteInfo();
const REFRESH_COMMAND = readRefreshCommand();
const PERF_THRESHOLD = 250;

export default function App() {
    const store = useGraphStore();

    // ---------- Инициализация один раз ----------
    const didInit = useRef(false);
    useEffect(() => {
        if (didInit.current) return;
        didInit.current = true;
        store.setNodes(buildInitialNodes(GRAPH_DATA));
        store.setEdges(buildInitialEdges(GRAPH_DATA));
        document.documentElement.setAttribute('data-theme', store.theme);
    }, []);

    const [toastVisible, setToastVisible] = React.useState(
        !!REMOTE_INFO?.fromCache
    );

    // ---------- Производные множества ----------
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

    const cyclesInfo = useMemo(
        () => findCycles(displayNodes, displayEdges),
        [displayNodes, displayEdges]
    );

    const healthMap = useMemo(() => {
        const map = new Map<string, any>();
        displayNodes.forEach((n) => {
            map.set(
                n.id,
                computeHealth(n, displayEdges, displayNodes, cyclesInfo.cycleNodes, null)
            );
        });
        return map;
    }, [displayNodes, displayEdges, cyclesInfo]);

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

    const edgesForRender = useMemo(() => {
        if (
            highlight &&
            (highlight.type === 'focus' ||
                highlight.type === 'cycle' ||
                highlight.type === 'path')
        ) {
            return edgesForFocus;
        }
        return filteredEdges;
    }, [filteredEdges, edgesForFocus, highlight]);

    const heatmapValues = useHeatmapValues(displayNodes, displayEdges, healthMap);
    const visibleNodes = useVisibleNodes(
        filteredNodes,
        highlight,
        healthMap,
        heatmapValues
    );
    const visibleEdges = useVisibleEdges(
        edgesForRender,
        highlight,
        violationsByEdge
    );

    const perfMode = useMemo(
        () => filteredEdges.length > PERF_THRESHOLD,
        [filteredEdges.length]
    );

    const displayEdgesForRender = useMemo(() => {
        const hideLabels = perfMode && !store.showEdgeLabels;
        if (!hideLabels) return visibleEdges;
        return visibleEdges.map((e) => (e.label ? { ...e } : e));
    }, [visibleEdges, perfMode, store.showEdgeLabels]);

    // ---------- Хуки верхнего уровня ----------
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

    // ---------- Reset ----------
    const handleResetAll = useCallback(() => {
        store.resetAll();
        invalidateLayout();
        setTimeout(() => {
            if (store.rfInstance) {
                try {
                    store.rfInstance.fitView({ duration: 500, padding: 0.15 });
                } catch { }
            }
        }, 200);
    }, [store, invalidateLayout]);

    // ---------- Tour ----------
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

    // ---------- Списки доменов для модалок ----------
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
                .filter(
                    (n) => store.bookmarks.has(n.id) && n.data.nodeType === 'domain'
                )
                .map((n) => ({ id: n.id, domainId: n.data.domainId })),
        [store.nodes, store.bookmarks]
    );

    const entityIndex = useMemo(
        () => buildEntityIndex(GRAPH_DATA.entities || []),
        []
    );

    // ---------- activeFiltersCount ----------
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
        store.filters,
        store.namespaceFilter,
        store.tagFilters,
        store.isolatedOnly,
        store.bookmarksOnly,
        store.onlyInvalid,
        store.hiddenNodeIds
    ]);

    const closeToast = useCallback(() => setToastVisible(false), []);

    // ---------- Рендер ----------
    return (
        <div className="app">
            <Sidebar
                healthMap={healthMap}
                cyclesCount={cyclesInfo.sccs.length}
                cacheDiff={GRAPH_DATA.cacheDiff || null}
                onFitView={() => {
                    if (store.rfInstance) {
                        try {
                            store.rfInstance.fitView({ duration: 500, padding: 0.15 });
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
                    totalNodesCount={store.nodes.length}
                    totalEdgesCount={store.edges.length}
                    activeFiltersCount={activeFiltersCount}
                    remoteInfo={REMOTE_INFO}
                    cycleHighlight={store.cycleHighlight}
                    ruleViolationsCount={ruleViolations.length}
                    onFindCycles={() =>
                        document.dispatchEvent(new CustomEvent(EVT_FIND_CYCLES))
                    }
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

                <ActiveModesBar ruleViolationsCount={ruleViolations.length} />

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
                        store.setEntityHierarchyInitialKey(key);
                        store.setEntityHierarchyOpen(true);
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
                onToastClose={closeToast}
            />
        </div>
    );
}