import React from 'react';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

export interface NewsSectionProps {
    cacheDiff: {
        added: any[];
        changed: any[];
        removed: any[];
        previousFetchedAt: string | null;
    } | null;
}

export function NewsSection({ cacheDiff }: NewsSectionProps) {
    const { goto } = useNavigation();
    if (!cacheDiff) return null;

    const newsCount =
        cacheDiff.added.length + cacheDiff.changed.length + cacheDiff.removed.length;

    return (
        <Section id="news" title="Что нового" icon="new_releases" badge={newsCount}>
            {newsCount === 0 && (
                <div className="news-empty">
                    <MIcon name="history_toggle_off" size="sm" />
                    <div>
                        <div>Изменений нет</div>
                        {cacheDiff.previousFetchedAt && (
                            <div style={{ fontSize: 11, color: 'var(--text-500)', marginTop: 4 }}>
                                с{' '}
                                {new Date(cacheDiff.previousFetchedAt).toLocaleString('ru-RU', {
                                    day: '2-digit',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {newsCount > 0 && cacheDiff.previousFetchedAt && (
                <div className="news-since">
                    с{' '}
                    {new Date(cacheDiff.previousFetchedAt).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
            )}

            {cacheDiff.added.length > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title" style={{ color: 'var(--success)' }}>
                        <MIcon name="add_circle" size="sm" /> Добавлено ({cacheDiff.added.length})
                    </div>
                    {cacheDiff.added.slice(0, 5).map((d) => (
                        <button key={d.sourceId} className="rank-item" onClick={() => goto(d.sourceId)}>
                            <span className="rank-item__label">{d.sourceId}</span>
                            {d.version && <span className="rank-item__value">{d.version}</span>}
                        </button>
                    ))}
                    {cacheDiff.added.length > 5 && (
                        <div className="news-more">...и ещё {cacheDiff.added.length - 5}</div>
                    )}
                </div>
            )}

            {cacheDiff.changed.length > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title" style={{ color: 'var(--accent-hover)' }}>
                        <MIcon name="update" size="sm" /> Изменено ({cacheDiff.changed.length})
                    </div>
                    {cacheDiff.changed.slice(0, 5).map((d) => (
                        <button key={d.sourceId} className="rank-item" onClick={() => goto(d.sourceId)}>
                            <span className="rank-item__label">{d.sourceId}</span>
                            {d.version && (
                                <span
                                    className="rank-item__value"
                                    style={{ fontSize: 10, fontFamily: 'monospace' }}
                                >
                                    {d.oldVersion && d.newVersion
                                        ? d.oldVersion + ' → ' + d.newVersion
                                        : d.version}
                                </span>
                            )}
                        </button>
                    ))}
                    {cacheDiff.changed.length > 5 && (
                        <div className="news-more">...и ещё {cacheDiff.changed.length - 5}</div>
                    )}
                </div>
            )}

            {cacheDiff.removed.length > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title" style={{ color: 'var(--danger)' }}>
                        <MIcon name="remove_circle" size="sm" /> Удалено ({cacheDiff.removed.length})
                    </div>
                    {cacheDiff.removed.slice(0, 5).map((d) => (
                        <div key={d.sourceId} className="rank-item" style={{ cursor: 'default' }}>
                            <span
                                className="rank-item__label"
                                style={{ textDecoration: 'line-through', opacity: 0.6 }}
                            >
                                {d.sourceId}
                            </span>
                        </div>
                    ))}
                    {cacheDiff.removed.length > 5 && (
                        <div className="news-more">...и ещё {cacheDiff.removed.length - 5}</div>
                    )}
                </div>
            )}
        </Section>
    );
}