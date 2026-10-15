import React, { useCallback, useEffect, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { computeLearningPath } from '../../lib/algorithms/learning-path';
import { generateLearningPathMarkdown } from '../../lib/markdown';
import { plural } from '../../lib/format';

export interface LearningPathModalProps {
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
    onStartTour: (path: any) => void;
}

function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function LearningPathModal(props: LearningPathModalProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();

    const [scope, setScope] = useState<'all' | 'visible' | 'bookmarked'>('all');
    const [path, setPath] = useState<any>(null);
    const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set([0]));

    const open = store.learningPathOpen;

    useEffect(() => {
        if (!open) {
            setPath(null);
            setExpandedStages(new Set([0]));
        }
    }, [open]);

    const build = useCallback(() => {
        let restrictTo: Set<string> | null = null;
        if (scope === 'visible') {
            restrictTo = new Set(props.visibleDomains.map((d) => d.id));
        } else if (scope === 'bookmarked') {
            restrictTo = new Set(props.bookmarkedDomains.map((d) => d.id));
        }

        let nodes = store.nodes;
        let edges = store.edges;
        if (restrictTo) {
            nodes = store.nodes.filter(
                (n) => restrictTo!.has(n.id) || n.data.nodeType !== 'domain'
            );
            edges = store.edges.filter(
                (e) => restrictTo!.has(e.source) && restrictTo!.has(e.target)
            );
        }

        setPath(computeLearningPath(nodes, edges));
    }, [scope, store.nodes, store.edges, props]);

    const exportMD = () => {
        if (!path) return;
        const md = generateLearningPathMarkdown(path, {
            scope: scope === 'all' ? 'все домены' : scope === 'visible' ? 'видимые' : 'избранные'
        });
        downloadFile(
            md,
            'learning-path-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md',
            'text/markdown;charset=utf-8'
        );
    };

    const exportJSON = () => {
        if (!path) return;
        downloadFile(
            JSON.stringify(path, null, 2),
            'learning-path-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json',
            'application/json'
        );
    };

    const copyAsText = () => {
        if (!path) return;
        const lines: string[] = [];
        lines.push('Порядок изучения (' + path.totalStages + ' этапов):');
        path.stages.forEach((stage: any) => {
            lines.push('');
            lines.push('— Этап ' + (stage.index + 1) + ' —');
            stage.domains.forEach((d: any) => lines.push('  ' + d.domainId));
        });
        navigator.clipboard.writeText(lines.join('\n'));
    };

    const toggleStage = (idx: number) => {
        setExpandedStages((prev) => {
            const s = new Set(prev);
            if (s.has(idx)) s.delete(idx);
            else s.add(idx);
            return s;
        });
    };

    const scopeOption = (
        value: 'all' | 'visible' | 'bookmarked',
        label: string,
        count: number
    ) => (
        <label className={'validation-scope__option' + (scope === value ? ' active' : '')}>
            <input type="radio" checked={scope === value} onChange={() => setScope(value)} />
            <span className="validation-scope__radio" />
            <span className="validation-scope__text">{label}</span>
            <span className="validation-scope__count">{count}</span>
        </label>
    );

    if (!open) return null;

    return (
        <div className="help-overlay" onMouseDown={() => store.setLearningPathOpen(false)}>
            <div
                className="help-modal learning-path-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">📖 Путь изучения архитектуры</div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setLearningPathOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="validation-modal__body">
                    {!path && (
                        <div className="validation-scope">
                            <div className="validation-scope__label">Область</div>
                            {scopeOption(
                                'all',
                                'Все домены',
                                store.nodes.filter((n) => n.data.nodeType === 'domain').length
                            )}
                            {scopeOption('visible', 'Только видимые', props.visibleDomains.length)}
                            {scopeOption('bookmarked', 'Только избранные', props.bookmarkedDomains.length)}

                            <div className="learning-path-hint" style={{ marginTop: 20 }}>
                                <div className="learning-path-hint__title">Что это даёт</div>
                                <ul className="learning-path-hint__list">
                                    <li>
                                        Порядок чтения — от «фундамента» к верхним слоям, чтобы зависимости были
                                        понятны с самого начала.
                                    </li>
                                    <li>
                                        Точки входа — домены, которые никто не использует: они показывают
                                        функциональность верхнего уровня.
                                    </li>
                                    <li>
                                        Камера экскурсии ведёт по этапам, показывая подсказки по каждому домену.
                                    </li>
                                </ul>
                            </div>

                            <button
                                className="btn btn--primary"
                                onClick={build}
                                style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
                            >
                                ▶ Построить путь изучения
                            </button>
                        </div>
                    )}

                    {path && (
                        <div className="topo-result">
                            {path.entryPoints.length > 0 && (
                                <div className="learning-entry-points">
                                    <div className="learning-entry-points__header">
                                        <span className="learning-entry-points__icon">🚪</span>
                                        <span>Точки входа ({path.entryPoints.length})</span>
                                        <span className="learning-entry-points__hint">
                                            — никто не зависит от них, но они зависят от других
                                        </span>
                                    </div>
                                    <div className="learning-entry-points__body">
                                        {path.entryPoints.slice(0, 12).map((d: any) => (
                                            <a
                                                key={d.id}
                                                className="validation-log__domain"
                                                onClick={() => {
                                                    goto(d.domainId);
                                                    store.setLearningPathOpen(false);
                                                }}
                                            >
                                                {d.domainId}
                                            </a>
                                        ))}
                                        {path.entryPoints.length > 12 && (
                                            <span style={{ fontSize: 11, color: 'var(--text-500)' }}>
                                                ...и ещё {path.entryPoints.length - 12}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {path.stages.map((stage: any) => {
                                const isOpen = expandedStages.has(stage.index);
                                return (
                                    <div
                                        key={stage.index}
                                        className={'topo-level' + (isOpen ? ' topo-level--open' : '')}
                                    >
                                        <div
                                            className="topo-level__header"
                                            onClick={() => toggleStage(stage.index)}
                                        >
                                            <span className="validation-log__chevron">
                                                {isOpen ? '▾' : '▸'}
                                            </span>
                                            <span className="topo-level__badge learning-path-stage-badge">
                                                {stage.index + 1}
                                            </span>
                                            <span className="topo-level__title">Этап {stage.index + 1}</span>
                                            <span className="topo-level__count">
                                                {stage.domains.length}{' '}
                                                {plural(stage.domains.length, 'домен', 'доменов')}
                                            </span>
                                        </div>

                                        {isOpen && (
                                            <div className="topo-level__body learning-stage-body">
                                                {stage.domains.map((d: any) => (
                                                    <div key={d.id} className="learning-domain-card">
                                                        <div className="learning-domain-card__head">
                                                            <a
                                                                className="validation-log__domain"
                                                                onClick={() => {
                                                                    goto(d.domainId);
                                                                    store.setLearningPathOpen(false);
                                                                }}
                                                            >
                                                                {d.domainId}
                                                            </a>
                                                            {d.label && d.label !== d.domainId && (
                                                                <span className="learning-domain-card__label">{d.label}</span>
                                                            )}
                                                        </div>
                                                        {d.description && (
                                                            <div className="learning-domain-card__desc">
                                                                {d.description}
                                                            </div>
                                                        )}
                                                        <div className="learning-domain-card__stats">
                                                            {d.fanIn > 0 && (
                                                                <span className="learning-domain-stat">
                                                                    <span className="learning-domain-stat__icon">↑</span>
                                                                    {d.fanIn} входящих
                                                                </span>
                                                            )}
                                                            {d.fanOut > 0 && (
                                                                <span className="learning-domain-stat">
                                                                    <span className="learning-domain-stat__icon">↓</span>
                                                                    {d.fanOut} исходящих
                                                                </span>
                                                            )}
                                                            {d.entitiesCount != null && (
                                                                <span className="learning-domain-stat">
                                                                    {d.entitiesCount} entities
                                                                </span>
                                                            )}
                                                            {d.tags && d.tags.length > 0 && (
                                                                <span className="learning-domain-stat learning-domain-stat--tags">
                                                                    {d.tags.slice(0, 4).join(', ')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {path.unresolved.length > 0 && (
                                <div className="topo-cyclic">
                                    <div className="topo-cyclic__header">
                                        <span className="topo-cyclic__icon">⚠️</span>
                                        <span>
                                            В цикле — читать после всех ({path.unresolved.length})
                                        </span>
                                    </div>
                                    <div className="topo-cyclic__body">
                                        {path.unresolved.map((d: any) => (
                                            <a
                                                key={d.id}
                                                className="validation-log__domain"
                                                onClick={() => {
                                                    goto(d.domainId);
                                                    store.setLearningPathOpen(false);
                                                }}
                                            >
                                                {d.domainId}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {path && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat">📖 {path.totalDomains} доменов</span>
                            <span className="validation-stat validation-stat--ok">
                                📊 {path.totalStages} этапов
                            </span>
                            {path.entryPoints.length > 0 && (
                                <span className="validation-stat">
                                    🚪 {path.entryPoints.length} входов
                                </span>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            <button
                                className="btn btn--primary"
                                onClick={() => {
                                    store.setLearningPathOpen(false);
                                    setTimeout(() => props.onStartTour(path), 50);
                                }}
                            >
                                ▶ Начать экскурсию
                            </button>
                            <button className="btn" onClick={copyAsText}>
                                📋 Копировать
                            </button>
                            <button className="btn" onClick={exportJSON}>
                                💾 JSON
                            </button>
                            <button className="btn" onClick={exportMD}>
                                📝 MD
                            </button>
                            <button className="btn" onClick={() => setPath(null)}>
                                ← Настройки
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}