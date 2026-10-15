import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useValidation } from '../../hooks/useValidation';
import { useNavigation } from '../../hooks/useNavigation';
import { generateValidationMarkdown } from '../../lib/markdown';
import { formatDuration, plural } from '../../lib/format';

export interface ValidationModalProps {
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

export function ValidationModal(props: ValidationModalProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const v = useValidation();

    const [scope, setScope] = useState<'all' | 'visible' | 'bookmarked'>('all');
    const [filter, setFilter] = useState<'problems' | 'all' | 'invalid' | 'errors' | 'valid'>('problems');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const open = store.validationOpen;

    const toggleExpanded = (id: string) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return s;
        });
    };

    const filteredLogs = useMemo(() => {
        if (filter === 'all') return v.logs;
        if (filter === 'valid') return v.logs.filter((l) => l.status === 'valid');
        if (filter === 'invalid') return v.logs.filter((l) => l.status === 'invalid');
        if (filter === 'errors') return v.logs.filter((l) => l.status === 'error');
        return v.logs.filter((l) => l.status !== 'valid' && l.status !== 'skip');
    }, [v.logs, filter]);

    const startValidation = () => {
        let domains: Array<{ id: string; domainId: string }>;
        if (scope === 'visible') domains = props.visibleDomains;
        else if (scope === 'bookmarked') domains = props.bookmarkedDomains;
        else domains = props.allDomains;

        setExpanded(new Set());
        v.start(scope, domains.map((d) => d.domainId));
    };

    const exportJSON = () => {
        if (!v.stats) return;
        const data = {
            generatedAt: new Date().toISOString(),
            stats: v.stats,
            cancelled: v.cancelled,
            results: v.logs.map((l) => ({
                domainId: l.domainId,
                status: l.status,
                diagnostics: l.diagnostics,
                error: l.error
            }))
        };
        downloadFile(
            JSON.stringify(data, null, 2),
            'validation-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json',
            'application/json'
        );
    };

    const exportMD = () => {
        if (!v.stats) return;
        const md = generateValidationMarkdown(v.stats, v.cancelled, v.logs);
        downloadFile(
            md,
            'validation-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md',
            'text/markdown;charset=utf-8'
        );
    };

    if (!open) return null;

    const pct = v.progress.total > 0 ? Math.round((v.progress.current / v.progress.total) * 100) : 0;

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

    return (
        <div
            className="help-overlay"
            onMouseDown={() => {
                if (!v.running) {
                    store.setValidationOpen(false);
                    v.reset();
                }
            }}
        >
            <div className="help-modal validation-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">🔍 Массовая валидация доменов</div>
                    <button
                        className="help-modal__close"
                        onClick={() => {
                            if (v.running) v.stop();
                            else {
                                store.setValidationOpen(false);
                                v.reset();
                            }
                        }}
                    >
                        {v.running ? '■ Стоп' : '✕'}
                    </button>
                </div>

                <div className="validation-modal__body">
                    {!v.started && (
                        <div className="validation-scope">
                            <div className="validation-scope__label">Область валидации</div>
                            {scopeOption('all', 'Все домены в кэше', props.allDomains.length)}
                            {scopeOption('visible', 'Только видимые (после фильтров)', props.visibleDomains.length)}
                            {scopeOption('bookmarked', 'Только избранные', props.bookmarkedDomains.length)}
                            <button
                                className="btn btn--primary"
                                onClick={startValidation}
                                style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}
                            >
                                ▶ Запустить валидацию
                            </button>
                        </div>
                    )}

                    {v.started && (
                        <div className="validation-progress">
                            <div className="validation-progress__bar">
                                <div
                                    className="validation-progress__fill"
                                    style={{ width: pct + '%' }}
                                />
                            </div>
                            <div className="validation-progress__text">
                                {v.progress.current} / {v.progress.total} ({pct}%)
                                {v.running ? ' — идёт валидация...' : v.cancelled ? ' — остановлено' : ' — завершено'}
                            </div>
                        </div>
                    )}

                    {v.started && (
                        <div className="validation-filters">
                            {(['problems', 'all', 'invalid', 'errors', 'valid'] as const).map((f) => {
                                const labels: Record<string, string> = {
                                    problems: 'Только проблемные',
                                    all: 'Все',
                                    invalid: '❌ Невалидные',
                                    errors: '⚠️ Ошибки',
                                    valid: '✅ Валидные'
                                };
                                return (
                                    <button
                                        key={f}
                                        className={'validation-filter' + (filter === f ? ' validation-filter--active' : '')}
                                        onClick={() => setFilter(f)}
                                    >
                                        {labels[f]}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {v.started && (
                        <div className="validation-logs">
                            {filteredLogs.length === 0 ? (
                                <div className="validation-logs__empty">Нет записей по фильтру</div>
                            ) : (
                                filteredLogs.map((log, i) => {
                                    const icon =
                                        log.status === 'valid' ? '✅' : log.status === 'invalid' ? '❌' : '⚠️';
                                    const isInvalid = log.status === 'invalid';
                                    const hasDiag = isInvalid && log.diagnostics && log.diagnostics.length > 0;
                                    const isOpen = expanded.has(log.domainId);

                                    return (
                                        <div
                                            key={i}
                                            className={
                                                'validation-log validation-log--' +
                                                log.status +
                                                (isOpen ? ' validation-log--open' : '')
                                            }
                                        >
                                            <div
                                                className={
                                                    'validation-log__head' + (hasDiag ? ' validation-log__head--clickable' : '')
                                                }
                                                onClick={hasDiag ? () => toggleExpanded(log.domainId) : undefined}
                                            >
                                                {hasDiag && (
                                                    <span className="validation-log__chevron">{isOpen ? '▾' : '▸'}</span>
                                                )}
                                                <span className="validation-log__icon">{icon}</span>
                                                <a
                                                    className="validation-log__domain"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        goto(log.domainId);
                                                        store.setValidationOpen(false);
                                                    }}
                                                >
                                                    {log.domainId}
                                                </a>
                                                {isInvalid && log.diagnostics && (
                                                    <span className="validation-log__count">
                                                        {log.diagnostics.length}{' '}
                                                        {plural(log.diagnostics.length, 'issue', 'issues')}
                                                    </span>
                                                )}
                                                {log.error && <span className="validation-log__error">{log.error}</span>}
                                                {hasDiag && !isOpen && (
                                                    <span className="validation-log__hint">нажмите, чтобы раскрыть</span>
                                                )}
                                            </div>

                                            {isOpen && hasDiag && (
                                                <div className="validation-log__diag">
                                                    {log.diagnostics!.map((d, di) => (
                                                        <div key={di} className="validation-diag">
                                                            <div className="validation-diag__severity">{d.severity}</div>
                                                            <div className="validation-diag__message">{d.message}</div>
                                                            {d.labels &&
                                                                d.labels.map((lb, li) => (
                                                                    <div key={li} className="validation-diag__label">
                                                                        {lb.message}
                                                                        {lb.span && (
                                                                            <span className="validation-diag__span">
                                                                                {' [' + lb.span.start + '-' + lb.span.end + ']'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {v.stats && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat validation-stat--ok">✅ {v.stats.valid}</span>
                            <span className="validation-stat validation-stat--err">❌ {v.stats.invalid}</span>
                            <span className="validation-stat validation-stat--warn">⚠️ {v.stats.errors}</span>
                            <span className="validation-stat">⏱ {formatDuration(v.stats.elapsedMs)}</span>
                        </div>
                        <div className="validation-footer__actions">
                            <button className="btn" onClick={exportJSON}>
                                💾 JSON
                            </button>
                            <button className="btn" onClick={exportMD}>
                                📝 Markdown
                            </button>
                            <button
                                className="btn"
                                onClick={() => {
                                    store.setValidationOpen(false);
                                    v.reset();
                                }}
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}