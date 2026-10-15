import React, { useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useSidebarStats } from '../../hooks/useSidebarStats';
import { MIcon } from '../common/MIcon';
import { Section } from './Section';
import {
    OverviewSection,
    ActivitySection,
    ProblemsSection,
    NewsSection,
    TopConnectedSection,
    WorstHealthSection,
    MissingRefsSection,
    NamespacesSection,
    TagsSection,
    BookmarksSection,
    LegendSection
} from './sections';

export interface SidebarProps {
    healthMap: Map<string, any>;
    cyclesCount: number;
    cacheDiff: any;
    onFitView: () => void;
    onExportStats: () => void;
}

export function Sidebar(props: SidebarProps) {
    const store = useGraphStore();
    const stats = useSidebarStats(props.healthMap);

    // Проблемные домены (невалидные) — из validationResults
    const problemDomains = useMemo(() => {
        if (!store.validationResults) return [];
        const result: Array<{ node: any; count: number }> = [];
        store.nodes.forEach((n) => {
            const v = store.validationResults!.get(n.data.domainId);
            if (v && v.status === 'invalid') {
                result.push({ node: n, count: (v.diagnostics || []).length });
            }
        });
        return result.sort((a, b) => b.count - a.count).slice(0, 5);
    }, [store.nodes, store.validationResults]);

    // Домены с битыми FQID
    const brokenRefsDomains = useMemo(() => {
        const result: Array<{ node: any; count: number }> = [];
        const domainIds = new Set<string>();
        store.nodes.forEach((n) => {
            if (n.data.nodeType === 'domain') domainIds.add(n.data.domainId.toLowerCase());
        });
        store.nodes.forEach((n) => {
            if (n.data.nodeType !== 'domain') return;
            const refs = n.data.fqidRefs || [];
            const broken = refs.filter(
                (r: any) => !domainIds.has((r.targetDomainId || '').toLowerCase())
            );
            if (broken.length > 0) result.push({ node: n, count: broken.length });
        });
        return result.sort((a, b) => b.count - a.count).slice(0, 5);
    }, [store.nodes]);

    const hasNews = !!props.cacheDiff;
    const hasProblems =
        problemDomains.length > 0 ||
        brokenRefsDomains.length > 0 ||
        stats.isolatedCount > 0 ||
        stats.counts.broken > 0 ||
        props.cyclesCount > 0;

    const totalProblems =
        stats.counts.missing +
        stats.counts.broken +
        problemDomains.length +
        props.cyclesCount;

    if (store.sidebarCollapsed) {
        return (
            <aside className="sidebar sidebar--collapsed">
                <button
                    className="sidebar__expand"
                    onClick={() => store.setSidebarCollapsed(false)}
                    title="Развернуть панель"
                >
                    <MIcon name="chevron_right" />
                </button>
            </aside>
        );
    }

    return (
        <aside className={'sidebar' + (store.sidebarCompact ? ' sidebar--compact' : '')}>
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    <MIcon name="hub" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sidebar__title">Domain Graph</div>
                    <div className="sidebar__subtitle">Analyzer</div>
                </div>
                <button
                    className="sidebar__icon-btn"
                    onClick={() => store.setSidebarCompact(!store.sidebarCompact)}
                    title={store.sidebarCompact ? 'Полный режим' : 'Компактный режим'}
                >
                    <MIcon name={store.sidebarCompact ? 'view_sidebar' : 'view_compact'} size="sm" />
                </button>
                <button
                    className="sidebar__icon-btn"
                    onClick={props.onExportStats}
                    title="Экспорт статистики в Markdown"
                >
                    <MIcon name="download" size="sm" />
                </button>
                <button
                    className="sidebar__icon-btn"
                    onClick={() => store.setSidebarCollapsed(true)}
                    title="Свернуть панель"
                >
                    <MIcon name="chevron_left" size="sm" />
                </button>
            </div>

            <div className="sidebar__body">
                <OverviewSection
                    counts={stats.counts}
                    isolatedCount={stats.isolatedCount}
                    problemDomainsCount={problemDomains.length}
                    cyclesCount={props.cyclesCount}
                    onFitView={props.onFitView}
                    onFilterMissing={() =>
                        store.setFilters((f) => ({ ...f, domain: false, broken: false, missing: true }))
                    }
                    onFilterBroken={() =>
                        store.setFilters((f) => ({ ...f, domain: false, missing: false, broken: true }))
                    }
                />

                <ActivitySection />

                {hasProblems && (
                    <ProblemsSection
                        isolatedCount={stats.isolatedCount}
                        cyclesCount={props.cyclesCount}
                        problemDomains={problemDomains}
                        brokenRefsDomains={brokenRefsDomains}
                        totalProblems={totalProblems}
                    />
                )}

                {hasNews && <NewsSection cacheDiff={props.cacheDiff} />}

                <TopConnectedSection items={stats.topConnected} />
                <WorstHealthSection items={stats.worstHealth} />
                <MissingRefsSection items={stats.topMissingRefs} />
                <NamespacesSection items={stats.namespaces} />
                <TagsSection items={stats.tagCloud} />
                <BookmarksSection />
                <LegendSection />
            </div>
        </aside>
    );
}