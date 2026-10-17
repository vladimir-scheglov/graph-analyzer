import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import { generatePiiMarkdown, downloadPiiMarkdown } from '../../lib/markdown/pii-markdown';
import type {
    PiiCategory,
    PiiHit,
    PiiSeverity
} from '../../../shared/pii-types';

const SEVERITY_LABELS: Record<PiiSeverity, string> = {
    critical: 'Спецкатегории',
    high: 'Высокая чувствительность',
    medium: 'Требуют внимания',
    low: 'Косвенно'
};

const CATEGORY_LABELS: Record<PiiCategory, string> = {
    identity: 'Идентичность (ФИО, дата рождения)',
    contact: 'Контакты (email, телефон, адрес)',
    document: 'Документы (паспорт, ИНН, СНИЛС)',
    financial: 'Финансовые (карты, счета)',
    biometric: 'Биометрия',
    special: 'Специальные категории (религия, здоровье)',
    location: 'Локация',
    technical: 'Технические (IP, deviceId)',
    custom: 'Прочие'
};

const SEVERITY_ORDER: PiiSeverity[] = ['critical', 'high', 'medium', 'low'];

// Хук для «не PII» из localStorage
const IGNORED_KEY = 'dg-pii-ignored';

function loadIgnored(): Set<string> {
    try {
        const raw = localStorage.getItem(IGNORED_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveIgnored(s: Set<string>): void {
    try {
        localStorage.setItem(IGNORED_KEY, JSON.stringify(Array.from(s)));
    } catch { }
}

export function PiiModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();

    const open = store.piiOpen;

    const [ignored, setIgnored] = useState<Set<string>>(loadIgnored);
    const [filterSeverity, setFilterSeverity] = useState<PiiSeverity | ''>('');
    const [filterCategory, setFilterCategory] = useState<PiiCategory | ''>('');
    const [showHelp, setShowHelp] = useState(false);

    const report = index?.pii ?? null;

    const visibleHits = useMemo(() => {
        if (!report) return [];
        return report.hits.filter((h) => {
            if (ignored.has(h.key)) return false;
            if (filterSeverity && h.severity !== filterSeverity) return false;
            if (filterCategory && h.category !== filterCategory) return false;
            return true;
        });
    }, [report, ignored, filterSeverity, filterCategory]);

    const grouped = useMemo(() => {
        const map = new Map<PiiSeverity, PiiHit[]>();
        SEVERITY_ORDER.forEach((s) => map.set(s, []));
        visibleHits.forEach((h) => {
            map.get(h.severity)!.push(h);
        });
        return map;
    }, [visibleHits]);

    const toggleIgnored = (key: string) => {
        setIgnored((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            saveIgnored(next);
            return next;
        });
    };

    const openEntity = (fqid: string) => {
        store.setPiiOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    const visibleCount = visibleHits.length;
    const ignoredCount = ignored.size;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setPiiOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        🔒 PII-атрибуты (персональные данные)
                        {report && (
                            <span className="help-modal__badge">{visibleCount}</span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__help-btn"
                            onClick={() => {
                                if (!report || !index) return;
                                const md = generatePiiMarkdown(report, index, {
                                    ignoredKeys: ignored
                                });
                                downloadPiiMarkdown(md);
                            }}
                            title="Скачать отчёт для DPO"
                            disabled={!report || report.hits.length === 0}
                        >
                            <MIcon name="download" />
                            <span>Экспорт отчёта</span>
                        </button>
                        <button
                            className={'help-modal__help-btn' + (showHelp ? ' active' : '')}
                            onClick={() => setShowHelp(!showHelp)}
                        >
                            <MIcon name="help" />
                            <span>{showHelp ? 'Скрыть' : 'Что это?'}</span>
                        </button>
                        <button
                            className="help-modal__close"
                            onClick={() => store.setPiiOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && report && (
                    <div className="help-modal__body help-modal__body--flush">
                        {showHelp && (
                            <div className="pii-help">
                                <div className="pii-help__section">
                                    <h3 className="pii-help__title">Что такое PII</h3>
                                    <p className="pii-help__text">
                                        <strong>PII (Personally Identifiable Information)</strong> —
                                        персональные данные: любые сведения, которые прямо или косвенно
                                        позволяют идентифицировать человека. В РФ регулируется 152-ФЗ, в ЕС — GDPR.
                                        Спецкатегории (здоровье, религия, биометрия) требуют особой защиты
                                        и отдельного согласия субъекта.
                                    </p>
                                </div>
                                <div className="pii-help__section">
                                    <h3 className="pii-help__title">Как читать результаты</h3>
                                    <ul className="pii-help__list">
                                        <li>
                                            <strong>Спецкатегории</strong> — критично. GDPR Art. 9 / 152-ФЗ спецкатегория.
                                        </li>
                                        <li>
                                            <strong>Высокая чувствительность</strong> — ФИО, email, телефон, паспорт.
                                            Требует защиты и политики retention.
                                        </li>
                                        <li>
                                            <strong>Требуют внимания</strong> — IP, deviceId, cookie.
                                            PII в контексте персональных сущностей.
                                        </li>
                                        <li>
                                            <strong>Косвенно</strong> — внутренние id, квази-идентификаторы.
                                            PII в комбинации с другими данными.
                                        </li>
                                    </ul>
                                </div>
                                <div className="pii-help__section">
                                    <h3 className="pii-help__title">Ложные срабатывания</h3>
                                    <p className="pii-help__text">
                                        Эвристика по именам — не идеальна. Например, <code>name</code> в
                                        сущности <code>Product</code> — не PII, а в <code>Employee</code> — да.
                                        Нажмите иконку ✓ рядом с атрибутом, чтобы исключить его из списка.
                                        Решение сохраняется в браузере.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Сводка */}
                        <div className="pii-summary">
                            {SEVERITY_ORDER.map((sev) => (
                                <button
                                    key={sev}
                                    className={'pii-summary-card pii-summary-card--' + sev + (filterSeverity === sev ? ' active' : '')}
                                    onClick={() => setFilterSeverity(filterSeverity === sev ? '' : sev)}
                                >
                                    <div className="pii-summary-card__count">{report.stats.bySeverity[sev]}</div>
                                    <div className="pii-summary-card__label">{SEVERITY_LABELS[sev]}</div>
                                </button>
                            ))}
                            <div className="pii-summary-card pii-summary-card--meta">
                                <div className="pii-summary-card__count">{report.stats.affectedDomains}</div>
                                <div className="pii-summary-card__label">доменов</div>
                            </div>
                            <div className="pii-summary-card pii-summary-card--meta">
                                <div className="pii-summary-card__count">{report.stats.affectedEntities}</div>
                                <div className="pii-summary-card__label">сущностей</div>
                            </div>
                        </div>

                        {/* Фильтр по категории */}
                        <div className="pii-filters">
                            <label className="entity-matrix-filter">
                                <span>Категория:</span>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value as PiiCategory | '')}
                                >
                                    <option value="">— все —</option>
                                    {(Object.keys(CATEGORY_LABELS) as PiiCategory[]).map((k) => {
                                        const count = report.stats.byCategory[k];
                                        if (count === 0) return null;
                                        return (
                                            <option key={k} value={k}>
                                                {CATEGORY_LABELS[k]} ({count})
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            {(filterSeverity || filterCategory || ignoredCount > 0) && (
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setFilterSeverity('');
                                        setFilterCategory('');
                                    }}
                                >
                                    Сбросить фильтры
                                    {ignoredCount > 0 && ` · игнорируется: ${ignoredCount}`}
                                </button>
                            )}
                        </div>

                        {/* Список */}
                        {visibleCount === 0 ? (
                            <div className="lint-empty">
                                <div className="lint-empty__icon">🛡️</div>
                                <div className="lint-empty__title">
                                    {report.stats.total === 0
                                        ? 'PII-атрибутов не обнаружено'
                                        : 'Ничего не найдено по фильтрам'}
                                </div>
                            </div>
                        ) : (
                            <div className="pii-list">
                                {SEVERITY_ORDER.map((sev) => {
                                    const items = grouped.get(sev) || [];
                                    if (items.length === 0) return null;
                                    return (
                                        <div key={sev} className={'pii-group pii-group--' + sev}>
                                            <div className="pii-group__title">
                                                {SEVERITY_LABELS[sev]} ({items.length})
                                            </div>
                                            {items.map((h) => (
                                                <div key={h.key} className="pii-item">
                                                    <div className="pii-item__head">
                                                        <code className="pii-item__id">
                                                            {h.entityFqid.split('/')[1]}.{h.attributeId}
                                                        </code>
                                                        <span className="pii-item__name">{h.attributeName}</span>
                                                        <span className="pii-item__type">{h.dataType}</span>
                                                        <span className="pii-item__category">
                                                            {CATEGORY_LABELS[h.category]}
                                                        </span>
                                                        <button
                                                            className="pii-item__ignore"
                                                            onClick={() => toggleIgnored(h.key)}
                                                            title="Считать, что это не PII"
                                                        >
                                                            <MIcon name="check_circle" size="sm" />
                                                        </button>
                                                    </div>
                                                    <div className="pii-item__meta">
                                                        <span className="pii-item__domain">{h.entityFqid.split('/')[0]}</span>
                                                        <span className="pii-item__reason">{h.reasons.join(' · ')}</span>
                                                        {h.regulation && (
                                                            <span className="pii-item__reg">{h.regulation}</span>
                                                        )}
                                                    </div>
                                                    <div className="pii-item__note">{h.note}</div>
                                                    <div className="pii-item__actions">
                                                        <button
                                                            className="btn"
                                                            onClick={() => openEntity(h.entityFqid)}
                                                        >
                                                            🎯 Открыть сущность
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {ignoredCount > 0 && (
                            <div className="pii-ignored-footer">
                                <span>
                                    Скрыто как «не PII»: <strong>{ignoredCount}</strong>
                                    <span style={{ marginLeft: 8, color: 'var(--text-500)', fontSize: 11 }}>
                                        (в отчёт не попадут)
                                    </span>
                                </span>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        setIgnored(new Set());
                                        saveIgnored(new Set());
                                    }}
                                >
                                    Сбросить
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}