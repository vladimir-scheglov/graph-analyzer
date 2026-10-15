import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import {
    buildDependencyGraph,
    topologicalSort,
    findDeps
} from '../../lib/algorithms/topological';
import { simplePatternMatch } from '../../lib/namespace-filter';

export interface TopoSortModalProps {
    allDomains: Array<{ id: string; domainId: string }>;
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
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

interface TopoResult {
    levels: string[][];
    cyclic: string[];
    broken: Array<{ id: string; level: number; brokenDeps: string[] }>;
    criticalPath: number;
    levelMap: Map<string, number>;
    stats: {
        total: number;
        levels: number;
        cyclic: number;
        criticalPath: number;
        excluded: number;
        brokenCount: number;
    };
}

export function TopoSortModal(props: TopoSortModalProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();

    const [scope, setScope] = useState<'all' | 'visible' | 'bookmarked'>('all');
    const [includeFqid, setIncludeFqid] = useState(true);
    const [includeLinkage, setIncludeLinkage] = useState(true);
    const [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
    const [excludePattern, setExcludePattern] = useState('');
    const [autoBreak, setAutoBreak] = useState(false);
    const [result, setResult] = useState<TopoResult | null>(null);
    const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
    const [expandedDeps, setExpandedDeps] = useState<Set<string>>(new Set());

    const open = store.topoOpen;

    useEffect(() => {
        if (!open) {
            setResult(null);
            setExpandedLevels(new Set());
            setExpandedDeps(new Set());
        }
    }, [open]);

    const build = useCallback(() => {
        const nodeSet =
            scope === 'visible' ? props.visibleDomains
                : scope === 'bookmarked' ? props.bookmarkedDomains
                    : props.allDomains;

        const restrictTo = new Set(nodeSet.map((d) => d.domainId));

        const excludedIds = new Set<string>();
        const tokens = excludePattern
            .replace(/[,;]/g, ' ')
            .split(' ')
            .filter((t) => t.length > 0);
        if (tokens.length > 0) {
            store.nodes.forEach((n) => {
                if (n.data.nodeType !== 'domain') return;
                for (const t of tokens) {
                    if (simplePatternMatch(n.data.domainId.toLowerCase(), t.toLowerCase())) {
                        excludedIds.add(n.data.domainId.toLowerCase());
                        return;
                    }
                }
            });
        }

        const depGraph = buildDependencyGraph(store.nodes, store.edges, {
            includeFqid,
            includeLinkage,
            missingAsSatisfied,
            excludedIds,
            restrictTo
        });

        const sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });

        const levelMap = new Map<string, number>();
        sorted.levels.forEach((level, idx) => {
            level.forEach((id) => levelMap.set(id, idx + 1));
        });

        setResult({
            levels: sorted.levels,
            cyclic: sorted.cyclic,
            broken: sorted.broken,
            criticalPath: sorted.criticalPath,
            levelMap,
            stats: {
                total: depGraph.domainIds.size,
                levels: sorted.levels.length,
                cyclic: sorted.cyclic.length,
                criticalPath: sorted.criticalPath,
                excluded: excludedIds.size,
                brokenCount: sorted.broken.length
            }
        });
    }, [
        autoBreak, scope, includeFqid, includeLinkage, missingAsSatisfied,
        excludePattern, store.nodes, store.edges, props
    ]);

    const exportJSON = () => {
        if (!result) return;
        downloadFile(
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    scope,
                    options: { includeFqid, includeLinkage, missingAsSatisfied, excludePattern },
                    criticalPath: result.criticalPath,
                    stats: result.stats,
                    levels: result.levels,
                    cyclic: result.cyclic,
                    broken: result.broken
                },
                null,
                2
            ),
            'topo-sort-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json',
            'application/json'
        );
    };

    const exportMD = () => {
        if (!result) return;
        const lines: string[] = [];
        lines.push('# Порядок установки доменов');
        lines.push('');
        lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
        lines.push('');
        lines.push('## Сводка');
        lines.push('');
        lines.push('| Метрика | Значение |');
        lines.push('| --- | ---: |');
        lines.push('| Всего доменов | ' + result.stats.total + ' |');
        lines.push('| Уровней | ' + result.stats.levels + ' |');
        lines.push('| Критический путь | ' + result.stats.criticalPath + ' |');
        lines.push('| В циклах | ' + result.stats.cyclic + ' |');
        lines.push('');
        result.levels.forEach((level, idx) => {
            lines.push('## Уровень ' + (idx + 1) + ' (' + level.length + ')');
            lines.push('');
            level.forEach((id) => lines.push('- `' + id + '`'));
            lines.push('');
        });
        if (result.broken.length > 0) {
            lines.push('## Разорванные циклы');
            lines.push('');
            result.broken.forEach((b) => {
                lines.push('- `' + b.id + '` (уровень ' + b.level + ')');
                b.brokenDeps.forEach((d) => lines.push('  - `' + d + '`'));
            });
            lines.push('');
        }
        if (result.cyclic.length > 0) {
            lines.push('## Требуют ручного вмешательства');
            lines.push('');
            result.cyclic.forEach((id) => lines.push('- `' + id + '`'));
            lines.push('');
        }
        downloadFile(
            lines.join('\n'),
            'topo-sort-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md',
            'text/markdown;charset=utf-8'
        );
    };

    const copyAsText = () => {
        if (!result) return;
        const lines: string[] = [];
        result.levels.forEach((level, idx) => {
            lines.push('# Уровень ' + (idx + 1));
            level.forEach((id) => lines.push(id));
            lines.push('');
        });
        if (result.cyclic.length > 0) {
            lines.push('# Циклические');
            result.cyclic.forEach((id) => lines.push(id));
        }
        navigator.clipboard.writeText(lines.join('\n'));
    };

    const toggleLevel = (idx: number) => {
        setExpandedLevels((prev) => {
            const s = new Set(prev);
            if (s.has(idx)) s.delete(idx);
            else s.add(idx);
            return s;
        });
    };

    const toggleDeps = (id: string) => {
        setExpandedDeps((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
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
        <div className="help-overlay" onMouseDown={() => store.setTopoOpen(false)}>
            <div className="help-modal topo-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">📦 Порядок установки доменов</div>
                    <button className="help-modal__close" onClick={() => store.setTopoOpen(false)}>
                        ✕
                    </button>
                </div>

                <div className="validation-modal__body">
                    {!result && (
                        <div className="validation-scope">
                            <div className="validation-scope__label">Область</div>
                            {scopeOption('all', 'Все домены', props.allDomains.length)}
                            {scopeOption('visible', 'Только видимые', props.visibleDomains.length)}
                            {scopeOption('bookmarked', 'Только избранные', props.bookmarkedDomains.length)}

                            <div className="validation-scope__label" style={{ marginTop: 16 }}>
                                Учитывать зависимости
                            </div>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    checked={includeFqid}
                                    onChange={() => setIncludeFqid(!includeFqid)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">FQID-ссылки</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    checked={includeLinkage}
                                    onChange={() => setIncludeLinkage(!includeLinkage)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Linkage-связи</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    checked={missingAsSatisfied}
                                    onChange={() => setMissingAsSatisfied(!missingAsSatisfied)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Missing-домены считать установленными</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    checked={autoBreak}
                                    onChange={() => setAutoBreak(!autoBreak)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Автоматически разрывать циклы</span>
                            </label>
                            <div className="menu__hint">
                                {autoBreak
                                    ? 'Домены с циклом будут размещены в порядке, а разорванные связи — помечены.'
                                    : 'Домены с циклом попадут в отдельный блок «Требуют ручного вмешательства».'}
                            </div>

                            <div className="validation-scope__label" style={{ marginTop: 16 }}>
                                Исключить домены по маске
                            </div>
                            <input
                                className="menu__input"
                                type="text"
                                placeholder="например: *.settings.*"
                                value={excludePattern}
                                onChange={(e) => setExcludePattern(e.target.value)}
                            />

                            <button
                                className="btn btn--primary"
                                onClick={build}
                                style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
                            >
                                ▶ Построить порядок
                            </button>
                        </div>
                    )}

                    {result && (
                        <div className="topo-result">
                            {(result.cyclic.length > 0 || result.broken.length > 0) && (
                                <div className="topo-cyclic">
                                    {result.cyclic.length > 0 && (
                                        <>
                                            <div className="topo-cyclic__header">
                                                <span className="topo-cyclic__icon">⚠️</span>
                                                <span>Требуют ручного вмешательства — цикл ({result.cyclic.length})</span>
                                            </div>
                                            <div className="topo-cyclic__body">
                                                {result.cyclic.map((id) => (
                                                    <a
                                                        key={id}
                                                        className="validation-log__domain"
                                                        onClick={() => {
                                                            goto(id);
                                                            store.setTopoOpen(false);
                                                        }}
                                                    >
                                                        {id}
                                                    </a>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {result.cyclic.length === 0 && result.broken.length > 0 && (
                                        <>
                                            <div className="topo-cyclic__header topo-cyclic__header--broken">
                                                <span className="topo-cyclic__icon">🔗</span>
                                                <span>Циклы разорваны автоматически ({result.broken.length})</span>
                                            </div>
                                            <div className="topo-cyclic__body">
                                                {result.broken.map((b) => (
                                                    <div key={b.id} className="topo-broken-item">
                                                        <a
                                                            className="validation-log__domain"
                                                            onClick={() => {
                                                                goto(b.id);
                                                                store.setTopoOpen(false);
                                                            }}
                                                        >
                                                            {b.id}
                                                        </a>
                                                        <span className="topo-broken-item__meta">L{b.level}</span>
                                                        {b.brokenDeps.length > 0 && (
                                                            <span
                                                                className="topo-broken-item__deps"
                                                                title={'Разорваны связи с: ' + b.brokenDeps.join(', ')}
                                                            >
                                                                ↯{b.brokenDeps.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {result.levels.map((level, idx) => {
                                const isOpen = expandedLevels.has(idx);
                                return (
                                    <div
                                        key={idx}
                                        className={'topo-level' + (isOpen ? ' topo-level--open' : '')}
                                    >
                                        <div className="topo-level__header" onClick={() => toggleLevel(idx)}>
                                            <span className="validation-log__chevron">{isOpen ? '▾' : '▸'}</span>
                                            <span className="topo-level__badge">{idx + 1}</span>
                                            <span className="topo-level__title">Уровень {idx + 1}</span>
                                            <span className="topo-level__count">
                                                {level.length}{' '}
                                                {level.length === 1 ? 'домен' : level.length < 5 ? 'домена' : 'доменов'}
                                            </span>
                                        </div>

                                        {isOpen && (
                                            <div className="topo-level__body">
                                                {level.map((id) => {
                                                    const isDepsOpen = expandedDeps.has(id);
                                                    const deps = findDeps(id, result.levelMap, store.edges, store.nodes);
                                                    const brokenInfo = result.broken.find((b) => b.id === id);
                                                    return (
                                                        <div
                                                            key={id}
                                                            className={'topo-domain' + (brokenInfo ? ' topo-domain--broken' : '')}
                                                        >
                                                            <div className="topo-domain__head">
                                                                {deps.length > 0 ? (
                                                                    <span
                                                                        className="validation-log__chevron"
                                                                        style={{ cursor: 'pointer' }}
                                                                        onClick={() => toggleDeps(id)}
                                                                    >
                                                                        {isDepsOpen ? '▾' : '▸'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="validation-log__chevron"> </span>
                                                                )}
                                                                <a
                                                                    className="validation-log__domain"
                                                                    onClick={() => {
                                                                        goto(id);
                                                                        store.setTopoOpen(false);
                                                                    }}
                                                                >
                                                                    {id}
                                                                </a>
                                                                {brokenInfo && (
                                                                    <span
                                                                        className="topo-broken-badge"
                                                                        title={
                                                                            'Цикл разорван. Отрезаны: ' +
                                                                            brokenInfo.brokenDeps.join(', ')
                                                                        }
                                                                    >
                                                                        ⚠️ цикл разорван
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isDepsOpen && deps.length > 0 && (
                                                                <div className="topo-domain__deps">
                                                                    {deps.map((dep) => (
                                                                        <div key={dep} className="topo-dep">
                                                                            <span className="topo-dep__level">
                                                                                L{result.levelMap.get(dep)}
                                                                            </span>
                                                                            <a
                                                                                className="validation-log__domain"
                                                                                onClick={() => {
                                                                                    goto(dep);
                                                                                    store.setTopoOpen(false);
                                                                                }}
                                                                            >
                                                                                {dep}
                                                                            </a>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {result && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat">📦 {result.stats.total}</span>
                            <span className="validation-stat validation-stat--ok">
                                📊 {result.stats.levels} уровней
                            </span>
                            <span className="validation-stat validation-stat--warn">
                                ⏱ {result.stats.criticalPath} шагов
                            </span>
                            {result.stats.brokenCount > 0 && (
                                <span className="validation-stat validation-stat--warn">
                                    🔗 {result.stats.brokenCount} разорвано
                                </span>
                            )}
                            {result.stats.cyclic > 0 && (
                                <span className="validation-stat validation-stat--err">
                                    ⚠️ {result.stats.cyclic} цикл.
                                </span>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            <button
                                className="btn"
                                onClick={() => {
                                    store.setTopoLevelMap(result.levelMap);
                                    store.setTopoOpen(false);
                                }}
                            >
                                🎨 На графе
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
                            <button className="btn" onClick={() => setResult(null)}>
                                ← Настройки
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}