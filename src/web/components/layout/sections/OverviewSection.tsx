import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

export interface OverviewSectionProps {
    counts: { domain: number; missing: number; broken: number; linkage: number; fqid: number };
    isolatedCount: number;
    problemDomainsCount: number;
    cyclesCount: number;
    onFitView: () => void;
    onFilterMissing: () => void;
    onFilterBroken: () => void;
}

export function OverviewSection(props: OverviewSectionProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();

    return (
        <Section id="overview" title="Обзор" icon="insights">
            <div className="stats-grid">
                <div className="stat-card stat-card--accent stat-card--clickable" onClick={props.onFitView}>
                    <div className="stat-card__value">{store.nodes.length}</div>
                    <div className="stat-card__label">Всего узлов</div>
                </div>
                <div className="stat-card stat-card--success stat-card--clickable" onClick={props.onFitView}>
                    <div className="stat-card__value">{store.edges.length}</div>
                    <div className="stat-card__label">Связей</div>
                </div>
                <div
                    className={
                        'stat-card stat-card--warning stat-card--clickable' +
                        (props.counts.missing === 0 ? ' stat-card--empty' : '')
                    }
                    onClick={() => props.counts.missing > 0 && props.onFilterMissing()}
                >
                    <div className="stat-card__value">{props.counts.missing}</div>
                    <div className="stat-card__label">Missing</div>
                </div>
                <div
                    className={
                        'stat-card stat-card--danger stat-card--clickable' +
                        (props.counts.broken === 0 ? ' stat-card--empty' : '')
                    }
                    onClick={() => props.counts.broken > 0 && props.onFilterBroken()}
                >
                    <div className="stat-card__value">{props.counts.broken}</div>
                    <div className="stat-card__label">Broken</div>
                </div>
            </div>

            <div className="quick-actions">
                <button
                    className="quick-action"
                    onClick={() => store.setIsolatedOnly(true)}
                    disabled={props.isolatedCount === 0}
                >
                    <MIcon name="radio_button_unchecked" size="sm" />
                    <span>Изолированные</span>
                    <span className="quick-action__count">{props.isolatedCount}</span>
                </button>

                <button
                    className="quick-action"
                    onClick={() => store.setOnlyInvalid(true)}
                    disabled={props.problemDomainsCount === 0}
                >
                    <MIcon name="cancel" size="sm" />
                    <span>Невалидные</span>
                    <span className="quick-action__count">{props.problemDomainsCount}</span>
                </button>

                <button
                    className="quick-action"
                    onClick={() => {
                        if (props.cyclesCount > 0) {
                            // Обработка клика по циклам — через store не вычислить без графа.
                            // Событие пробросим через dispatch, App подхватит.
                            document.dispatchEvent(new CustomEvent('dg:find-cycles'));
                        }
                    }}
                    disabled={props.cyclesCount === 0}
                >
                    <MIcon name="cycle" size="sm" />
                    <span>Циклы</span>
                    <span className="quick-action__count">{props.cyclesCount}</span>
                </button>

                {store.bookmarks.size > 0 && (
                    <button className="quick-action" onClick={() => store.setBookmarksOnly(true)}>
                        <MIcon name="star" size="sm" fill />
                        <span>Избранные</span>
                        <span className="quick-action__count">{store.bookmarks.size}</span>
                    </button>
                )}
            </div>
        </Section>
    );
}