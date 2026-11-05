import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { MIcon } from '../../common/MIcon';

export interface StickyKpiHeaderProps {
    counts: {
        domain: number;
        missing: number;
        broken: number;
        linkage: number;
        fqid: number;
    };
    entitiesCount: number;
    problemDomainsCount: number;
    cyclesCount: number;
    onFitView: () => void;
}

export function StickyKpiHeader(props: StickyKpiHeaderProps) {
    const bookmarks = useGraphStore((s) => s.bookmarks);
    const entityFavorites = useGraphStore((s) => s.entityFavorites);
    const setBookmarksOnly = useGraphStore((s) => s.setBookmarksOnly);
    const setOnlyInvalid = useGraphStore((s) => s.setOnlyInvalid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    const setEntityCatalogInitialFqid = useGraphStore(
        (s) => s.setEntityCatalogInitialFqid,
    );

    const totalFavorites = bookmarks.size + entityFavorites.size;
    const totalProblems =
        props.counts.missing +
        props.counts.broken +
        props.problemDomainsCount +
        props.cyclesCount;

    const openCatalog = () => {
        setEntityCatalogInitialFqid(null);
        setEntityCatalogOpen(true);
    };

    return (
        <div className="sidebar-kpi">
            <button
                className="sidebar-kpi__item"
                onClick={props.onFitView}
                title="Вписать граф / прокрутить к началу"
            >
                <div className="sidebar-kpi__value">{props.counts.domain}</div>
                <div className="sidebar-kpi__label">домены</div>
            </button>
            <button
                className="sidebar-kpi__item"
                onClick={openCatalog}
                title="Открыть каталог сущностей"
            >
                <div className="sidebar-kpi__value">{props.entitiesCount}</div>
                <div className="sidebar-kpi__label">сущности</div>
            </button>
            <button
                className={
                    'sidebar-kpi__item' +
                    (totalProblems > 0 ? ' sidebar-kpi__item--warn' : '')
                }
                onClick={() => {
                    if (totalProblems === 0) return;
                    setOnlyInvalid(true);
                }}
                title={
                    totalProblems > 0
                        ? `Проблемы: ${props.counts.missing} missing · ${props.counts.broken} broken · ${props.problemDomainsCount} невалид. · ${props.cyclesCount} цикл.`
                        : 'Проблем не обнаружено'
                }
                disabled={totalProblems === 0}
            >
                <div className="sidebar-kpi__value">{totalProblems}</div>
                <div className="sidebar-kpi__label">проблемы</div>
            </button>
            <button
                className="sidebar-kpi__item"
                onClick={() => setBookmarksOnly(!useGraphStore.getState().bookmarksOnly)}
                title={`${bookmarks.size} доменов, ${entityFavorites.size} сущностей в избранном`}
            >
                <div className="sidebar-kpi__value">
                    {totalFavorites}
                    <MIcon name="star" size="sm" className="sidebar-kpi__star" fill />
                </div>
                <div className="sidebar-kpi__label">избранное</div>
            </button>
        </div>
    );
}