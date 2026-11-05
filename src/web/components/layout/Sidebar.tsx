import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useSidebarStats } from '../../hooks/useSidebarStats';
import { MIcon } from '../common/MIcon';
import { Popover } from '../common/Popover';
import { StickyKpiHeader } from './sections/StickyKpiHeader';
import { RatingsSection } from './sections/RatingsSection';
import { CloudsSection } from './sections/CloudsSection';
import { FavoritesSection } from './sections/FavoritesSection';
import { ProjectHealthSection } from './sections/ProjectHealthSection';
import { ProblemsSection } from './sections/ProblemsSection';
import { ActivitySection } from './sections/ActivitySection';
import { NewsSection } from './sections/NewsSection';
import { LegendSection } from './sections/LegendSection';
import { SidebarMenu, type SidebarSection } from './SidebarMenu';

export interface SidebarProps {
    healthMap: Map<string, any>;
    cyclesCount: number;
    cacheDiff: any;
    onFitView: () => void;
    onExportStats: () => void;
}

export function Sidebar(props: SidebarProps) {
    const stats = useSidebarStats(props.healthMap);
    const viewMode = useGraphStore((s) => s.viewMode);
    const validationResults = useGraphStore((s) => s.validationResults);
    const nodes = useGraphStore((s) => s.nodes);
    const sidebarCollapsed = useGraphStore((s) => s.sidebarCollapsed);
    const sidebarCompact = useGraphStore((s) => s.sidebarCompact);
    const sidebarWidth = useGraphStore((s) => s.sidebarWidth);
    const setSidebarWidth = useGraphStore((s) => s.setSidebarWidth);
    const hidden = useGraphStore((s) => s.hiddenSidebarSections);
    const collapsedSections = useGraphStore((s) => s.collapsedSections);
    const setCollapsedSections = useGraphStore((s) => s.setCollapsedSections);

    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [resizing, setResizing] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const asideRef = useRef<HTMLElement>(null);

    // ── Список всех секций для меню «скрыть» ──
    const allSections: SidebarSection[] = useMemo(
        () => [
            { id: 'project-health', title: 'Здоровье модели', icon: 'monitor_heart' },
            { id: 'problems', title: 'Проблемы', icon: 'warning' },
            { id: 'activity', title: 'Активность', icon: 'trending_up' },
            { id: 'ratings', title: 'Рейтинги', icon: 'bar_chart' },
            { id: 'clouds', title: 'Облака', icon: 'cloud' },
            { id: 'favorites', title: 'Избранное', icon: 'star' },
            { id: 'news', title: 'Что нового', icon: 'new_releases' },
            { id: 'legend', title: 'Легенда', icon: 'palette' },
        ],
        [],
    );

    // ── Problem domains / broken refs ──
    const problemDomains = useMemo(() => {
        if (!validationResults) return [];
        const result: Array<{ node: any; count: number }> = [];
        nodes.forEach((n) => {
            const v = validationResults!.get(n.data.domainId);
            if (v && v.status === 'invalid') {
                result.push({ node: n, count: (v.diagnostics || []).length });
            }
        });
        return result.sort((a, b) => b.count - a.count).slice(0, 5);
    }, [nodes, validationResults]);

    const brokenRefsDomains = useMemo(() => {
        const result: Array<{ node: any; count: number }> = [];
        const domainIds = new Set<string>();
        nodes.forEach((n) => {
            if (n.data.nodeType === 'domain')
                domainIds.add(n.data.domainId.toLowerCase());
        });
        nodes.forEach((n) => {
            if (n.data.nodeType !== 'domain') return;
            const refs = n.data.fqidRefs || [];
            const broken = refs.filter(
                (r: any) =>
                    !domainIds.has((r.targetDomainId || '').toLowerCase()),
            );
            if (broken.length > 0) result.push({ node: n, count: broken.length });
        });
        return result.sort((a, b) => b.count - a.count).slice(0, 5);
    }, [nodes]);

    const totalEntities = useMemo(
        () =>
            nodes
                .filter((n) => n.data.nodeType === 'domain')
                .reduce((s, n) => s + (n.data.entitiesCount || 0), 0),
        [nodes],
    );

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

    const hasNews = !!props.cacheDiff;

    // ── Фильтр по поиску секций ──
    const q = searchQuery.trim().toLowerCase();
    const matches = useCallback(
        (title: string) => !q || title.toLowerCase().includes(q),
        [q],
    );

    // ── Авто-фокус поиска ──
    useEffect(() => {
        if (searchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 20);
        } else {
            setSearchQuery('');
        }
    }, [searchOpen]);

    // ── Resize ──
    const startResize = (e: React.MouseEvent) => {
        e.preventDefault();
        setResizing(true);
        const startX = e.clientX;
        const startW = sidebarWidth;

        const onMove = (ev: MouseEvent) => {
            const delta = ev.clientX - startX;
            setSidebarWidth(startW + delta);
        };
        const onUp = () => {
            setResizing(false);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // ── Свернуть/развернуть всё ──
    const collapseAll = useCallback(() => {
        setCollapsedSections(new Set(allSections.map((s) => s.id)));
    }, [allSections, setCollapsedSections]);

    const expandAll = useCallback(() => {
        setCollapsedSections(new Set());
    }, [setCollapsedSections]);

    // ── Свёрнутый режим ──
    if (sidebarCollapsed) {
        return (
            <aside className="sidebar sidebar--collapsed">
                <button
                    className="sidebar__expand"
                    onClick={() =>
                        useGraphStore.getState().setSidebarCollapsed(false)
                    }
                    title="Развернуть панель"
                >
                    <MIcon name="chevron_right" />
                </button>
            </aside>
        );
    }

    const anyVisibleProblem = totalProblems > 0;

    return (
        <aside
            ref={asideRef}
            className={
                'sidebar' +
                (sidebarCompact ? ' sidebar--compact' : '') +
                (resizing ? ' sidebar--resizing' : '')
            }
            style={{ width: sidebarWidth }}
        >
            {/* ── Header ── */}
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    <MIcon name="hub" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sidebar__title">Domains</div>
                    <div className="sidebar__subtitle">Analyzer</div>
                </div>
                <button
                    className={
                        'sidebar__icon-btn' + (searchOpen ? ' active' : '')
                    }
                    onClick={() => setSearchOpen(!searchOpen)}
                    title={searchOpen ? 'Скрыть поиск' : 'Поиск по секциям'}
                >
                    <MIcon name={searchOpen ? 'close' : 'search'} size="sm" />
                </button>
                <Popover
                    width={260}
                    align="right"
                    trigger={(open) => (
                        <button
                            className={
                                'sidebar__icon-btn' + (open ? ' active' : '')
                            }
                            title="Настройки секций"
                        >
                            <MIcon name="more_horiz" size="sm" />
                        </button>
                    )}
                >
                    {(close) => (
                        <SidebarMenu
                            sections={allSections}
                            onCollapseAll={collapseAll}
                            onExpandAll={expandAll}
                            onExportStats={props.onExportStats}
                            onClose={close}
                        />
                    )}
                </Popover>
                <button
                    className="sidebar__icon-btn"
                    onClick={() =>
                        useGraphStore
                            .getState()
                            .setSidebarCompact(!sidebarCompact)
                    }
                    title={
                        sidebarCompact ? 'Полный режим' : 'Компактный режим'
                    }
                >
                    <MIcon
                        name={sidebarCompact ? 'view_sidebar' : 'view_compact'}
                        size="sm"
                    />
                </button>
                <button
                    className="sidebar__icon-btn"
                    onClick={() =>
                        useGraphStore.getState().setSidebarCollapsed(true)
                    }
                    title="Свернуть панель"
                >
                    <MIcon name="chevron_left" size="sm" />
                </button>
            </div>

            {/* ── Поиск по секциям ── */}
            {searchOpen && (
                <div className="sidebar__search">
                    <MIcon name="search" size="sm" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Поиск по секциям…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {searchQuery && (
                        <button
                            className="sidebar__search-clear"
                            onClick={() => setSearchQuery('')}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>
            )}

            {/* ── KPI ── */}
            {!q && (
                <StickyKpiHeader
                    counts={stats.counts}
                    entitiesCount={totalEntities}
                    problemDomainsCount={problemDomains.length}
                    cyclesCount={props.cyclesCount}
                    onFitView={props.onFitView}
                />
            )}

            {/* ── Body ── */}
            <div className="sidebar__body">
                {!hidden.has('project-health') && matches('Здоровье модели') && (
                    <ProjectHealthSection />
                )}

                {!hidden.has('problems') &&
                    hasProblems &&
                    matches('Проблемы') && (
                        <ProblemsSection
                            isolatedCount={stats.isolatedCount}
                            cyclesCount={props.cyclesCount}
                            problemDomains={problemDomains}
                            brokenRefsDomains={brokenRefsDomains}
                            totalProblems={totalProblems}
                        />
                    )}

                {!hidden.has('activity') && matches('Активность') && (
                    <ActivitySection />
                )}

                {!hidden.has('ratings') &&
                    matches('Рейтинги') &&
                    (stats.topConnected.length > 0 ||
                        stats.worstHealth.length > 0) && (
                        <RatingsSection
                            topConnected={stats.topConnected}
                            worstHealth={stats.worstHealth}
                            compact={sidebarCompact}
                        />
                    )}

                {!hidden.has('clouds') &&
                    matches('Облака') &&
                    (stats.namespaces.length > 0 ||
                        stats.tagCloud.length > 0) && (
                        <CloudsSection
                            namespaces={stats.namespaces}
                            tagCloud={stats.tagCloud}
                        />
                    )}

                {!hidden.has('favorites') && matches('Избранное') && (
                    <FavoritesSection />
                )}

                {!hidden.has('news') && hasNews && matches('Что нового') && (
                    <NewsSection cacheDiff={props.cacheDiff} />
                )}

                {!hidden.has('legend') &&
                    viewMode === 'graph' &&
                    matches('Легенда') && <LegendSection />}

                {/* ── Пусто, если поиск ничего не нашёл ── */}
                {q &&
                    !allSections.some((s) => matches(s.title)) && (
                        <div className="sidebar__empty-search">
                            <MIcon name="search_off" size="lg" />
                            <div>Ничего не найдено</div>
                            <button
                                className="btn btn--small"
                                onClick={() => setSearchQuery('')}
                            >
                                Сбросить поиск
                            </button>
                        </div>
                    )}

                {/* ── Badge «N секций скрыто» ── */}
                {hidden.size > 0 && !q && (
                    <div className="sidebar__hidden-hint">
                        <MIcon name="visibility_off" size="sm" />
                        <span>
                            {hidden.size}{' '}
                            {hidden.size === 1 ? 'секция скрыта' : 'секции скрыто'}
                        </span>
                        <button
                            className="sidebar__hidden-hint__show"
                            onClick={() => {
                                hidden.forEach((id) =>
                                    useGraphStore
                                        .getState()
                                        .toggleHiddenSidebarSection(id),
                                );
                            }}
                        >
                            Показать все
                        </button>
                    </div>
                )}

                {/* ── Быстрая кнопка «свернуть всё» при большом скролле ── */}
                {collapsedSections.size === 0 && !q && (
                    <button
                        className="sidebar__collapse-all-float"
                        onClick={collapseAll}
                        title="Свернуть все секции"
                    >
                        <MIcon name="unfold_less" size="sm" />
                    </button>
                )}
            </div>

            {/* ── Resizer ── */}
            <div
                className={
                    'sidebar__resizer' +
                    (resizing ? ' sidebar__resizer--active' : '')
                }
                onMouseDown={startResize}
                title="Потянуть, чтобы изменить ширину"
            />
        </aside>
    );
}