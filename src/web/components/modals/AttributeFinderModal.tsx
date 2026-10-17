import React, { useCallback, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import {
    searchAttributes,
    collectDataTypes,
    collectConstraints,
    AttributeHit
} from '../../lib/model/attribute-search';
import { EntityRecord } from '../../../shared/model-types';

export function AttributeFinderModal() {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();
    const [onlyPii, setOnlyPii] = useState(false);

    const [query, setQuery] = useState('');
    const [domainFilter, setDomainFilter] = useState<Set<string>>(new Set());
    const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
    const [constraintFilter, setConstraintFilter] = useState<string>('');
    const [showSummary, setShowSummary] = useState(true);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const open = store.attributeFinderOpen;

    const allTypes = useMemo(() => (index ? collectDataTypes(index) : []), [index]);
    const allConstraints = useMemo(() => (index ? collectConstraints(index) : []), [index]);

    const allDomains = useMemo(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const toggleHit = useCallback(
        (key: string) => {
            setExpandedKey((prev) => (prev === key ? null : key));
        },
        []
    );

    const openEntity = useCallback(
        (entity: EntityRecord) => {
            goto(entity.domainId);
            store.setEntityCatalogInitialFqid(entity.fqid);
            store.setEntityCatalogOpen(true);
            store.setAttributeFinderOpen(false);
        },
        [goto, store]
    );

    const [limit, setLimit] = useState(300);

    const result = useMemo(() => {
        if (!index) return { hits: [], byName: [], totalHits: 0 };
        return searchAttributes(index, query, {
            domains: domainFilter,
            dataTypes: typeFilter,
            constraint: constraintFilter || undefined,
            limit
        });
    }, [index, query, domainFilter, typeFilter, constraintFilter, limit]);

    const piiKeys = useMemo(() => {
        if (!index) return new Set<string>();
        return new Set(index.pii.hits.map((h) => h.key));
    }, [index]);

    const filteredHits = useMemo(() => {
        let hits = result.hits;
        if (onlyPii) {
            hits = hits.filter((h) => piiKeys.has(h.key));
        }
        return hits;
    }, [result.hits, onlyPii, piiKeys]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setAttributeFinderOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        🔎 Поиск атрибутов
                        {index && (
                            <span className="help-modal__badge">
                                {result.totalHits} совпадений
                            </span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setAttributeFinderOpen(false)}
                    >
                        ✕
                    </button>
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

                {index && (
                    <div className="entity-hierarchy-body">
                        {/* ============ ЛЕВАЯ ПАНЕЛЬ ============ */}
                        <div className="attribute-filters">
                            <div className="entity-search-input-wrap">
                                <span className="entity-search-icon">🔍</span>
                                <input
                                    className="entity-search-input"
                                    type="text"
                                    placeholder="email, createdAt, iocId..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    autoFocus
                                />
                                {query && (
                                    <button
                                        className="entity-search-clear"
                                        onClick={() => setQuery('')}
                                        title="Очистить"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="entity-catalog-filter-body">
                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">
                                        Тип данных {typeFilter.size > 0 && `(${typeFilter.size})`}
                                    </div>
                                    <div className="entity-catalog-chips">
                                        {allTypes.slice(0, 24).map(({ type, count }) => {
                                            const active = typeFilter.has(type);
                                            return (
                                                <button
                                                    key={type}
                                                    className={'entity-catalog-chip' + (active ? ' active' : '')}
                                                    onClick={() => {
                                                        const next = new Set(typeFilter);
                                                        if (active) next.delete(type);
                                                        else next.add(type);
                                                        setTypeFilter(next);
                                                    }}
                                                >
                                                    {type}
                                                    <span className="entity-catalog-chip__count">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">Ограничения</div>
                                    <select
                                        className="menu__input"
                                        style={{ width: '100%', margin: 0 }}
                                        value={constraintFilter}
                                        onChange={(e) => setConstraintFilter(e.target.value)}
                                    >
                                        <option value="">— все —</option>
                                        {allConstraints.map(({ kind, count }) => (
                                            <option key={kind} value={kind}>
                                                {kind} ({count})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">
                                        Домены {domainFilter.size > 0 && `(${domainFilter.size})`}
                                    </div>
                                    <div className="entity-catalog-chips">
                                        {allDomains.slice(0, 30).map(([domainId, count]) => {
                                            const active = domainFilter.has(domainId.toLowerCase());
                                            return (
                                                <button
                                                    key={domainId}
                                                    className={'entity-catalog-chip' + (active ? ' active' : '')}
                                                    onClick={() => {
                                                        const next = new Set(domainFilter);
                                                        if (active) next.delete(domainId.toLowerCase());
                                                        else next.add(domainId.toLowerCase());
                                                        setDomainFilter(next);
                                                    }}
                                                >
                                                    {domainId}
                                                    <span className="entity-catalog-chip__count">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <button
                                    className="btn"
                                    style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                                    onClick={() => {
                                        setDomainFilter(new Set());
                                        setTypeFilter(new Set());
                                        setConstraintFilter('');
                                        setQuery('');
                                    }}
                                >
                                    Сбросить всё
                                </button>
                            </div>
                        </div>

                        {/* ============ ПРАВАЯ ЧАСТЬ ============ */}
                        <div className="attribute-panel">
                            {/* Режим: сводка или список */}
                            {query.trim() === '' && result.totalHits > 0 && (
                                <div className="attribute-tabs">
                                    <button
                                        className={'attribute-tab' + (showSummary ? ' active' : '')}
                                        onClick={() => setShowSummary(true)}
                                    >
                                        Сводка по именам ({result.byName.length})
                                    </button>
                                    <button
                                        className={'attribute-tab' + (!showSummary ? ' active' : '')}
                                        onClick={() => setShowSummary(false)}
                                    >
                                        Все атрибуты ({result.totalHits})
                                    </button>
                                    <label className="entity-graph-toggle">
                                        <input
                                            type="checkbox"
                                            checked={onlyPii}
                                            onChange={() => setOnlyPii(!onlyPii)}
                                        />
                                        <MIcon name="shield_lock" size="sm" />
                                        Только PII
                                    </label>
                                </div>
                            )}

                            {query.trim() === '' && showSummary && result.byName.length > 0 && (
                                <div className="attribute-summary">
                                    {result.byName.map(({ name, count, domains }) => (
                                        <button
                                            key={name}
                                            className="attribute-summary-item"
                                            onClick={() => {
                                                setQuery(name);
                                                setShowSummary(false);
                                            }}
                                        >
                                            <span className="attribute-summary-item__name">{name}</span>
                                            <span className="attribute-summary-item__count">{count}</span>
                                            <span className="attribute-summary-item__domains">
                                                {domains.slice(0, 3).map((d) => (
                                                    <code key={d}>{d}</code>
                                                ))}
                                                {domains.length > 3 && <span>+{domains.length - 3}</span>}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(query.trim() !== '' || !showSummary) && (
                                <div className="attribute-hits">
                                    {filteredHits.length === 0 ? (
                                        <div className="entity-catalog-empty">
                                            {query.trim() ? 'Ничего не найдено по запросу' : 'Нет атрибутов'}
                                        </div>
                                    ) : (
                                        filteredHits.map((hit) => (
                                            <AttributeHitRow
                                                key={hit.key}
                                                hit={hit}
                                                query={query}
                                                expanded={expandedKey === hit.key}
                                                onToggle={toggleHit}
                                                onOpenEntity={openEntity}
                                                isPii={piiKeys.has(hit.key)}
                                            />
                                        ))
                                    )}
                                    {result.totalHits > filteredHits.length && (
                                        <div style={{ padding: 16, textAlign: 'center' }}>
                                            <button className="btn" onClick={() => setLimit((n) => n + 300)}>
                                                Показать ещё 300 (осталось {result.totalHits - filteredHits.length})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Отдельная строка результата ============

interface AttributeHitRowProps {
    hit: AttributeHit;
    query: string;
    expanded: boolean;
    onToggle: (key: string) => void;
    onOpenEntity: (entity: EntityRecord) => void;
    isPii: boolean;
}

const AttributeHitRow = React.memo(function AttributeHitRow({ hit, query, expanded, isPii, onToggle, onOpenEntity }: AttributeHitRowProps) {
    const { attribute, entity, matchedBy } = hit;

    const highlight = (text: string) => {
        if (!query) return text;
        const q = query.toLowerCase();
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="search-hl">{text.slice(idx, idx + q.length)}</mark>
                {text.slice(idx + q.length)}
            </>
        );
    };

    return (
        <div className={'attribute-hit' + (expanded ? ' attribute-hit--expanded' : '')}>
            {/* Заголовок — кликабельный для разворота */}
            <div
                className="attribute-hit__head"
                onClick={() => onToggle(hit.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle(hit.key);
                    }
                }}
            >
                <code className="attribute-hit__id">{highlight(attribute.id)}</code>
                <span className="attribute-hit__name">{highlight(attribute.name)}</span>
                {matchedBy === 'description' && (
                    <span className="attribute-hit__match-badge">по описанию</span>
                )}
                <span className="attribute-hit__toggle-hint">
                    {expanded ? 'свернуть ▴' : 'детали ▾'}
                </span>
            </div>

            <div className="attribute-hit__meta">
                {isPii && (
                    <span className="pii-badge" title="PII"><MIcon name="lock" size="sm" /></span>
                )}
                {/* Чип сущности — отдельная кнопка, ведёт в каталог */}
                <button
                    className="attribute-hit__entity"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenEntity(entity);
                    }}
                    title={`Открыть ${entity.fqid} в каталоге`}
                >
                    <MIcon name="hub" size="sm" />
                    <span>{entity.entityId}</span>
                    <span className="attribute-hit__domain">{entity.domainId}</span>
                </button>

                <span className="attribute-hit__type">{attribute.dataType}</span>
                {attribute.referenceEntity && (
                    <span className="attribute-hit__ref">
                        → {attribute.referenceEntity.split('/')[1]}
                    </span>
                )}
                {attribute.constraints.length > 0 && (
                    <span className="attribute-hit__constraints">
                        {attribute.constraints.map((c) => (
                            <span key={c} className="impact-attr__constraint">{c}</span>
                        ))}
                    </span>
                )}
            </div>

            {/* Развёрнутая часть */}
            {expanded && (
                <div className="attribute-hit__details">
                    {attribute.description ? (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Описание</span>
                            <span className="attribute-hit__detail-value">
                                {highlight(attribute.description)}
                            </span>
                        </div>
                    ) : (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Описание</span>
                            <span className="attribute-hit__detail-value attribute-hit__detail-value--muted">
                                нет
                            </span>
                        </div>
                    )}

                    <div className="attribute-hit__detail-row">
                        <span className="attribute-hit__detail-label">Полный ID</span>
                        <code className="attribute-hit__detail-value">{hit.key}</code>
                    </div>

                    {attribute.itemDataType && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Элемент массива</span>
                            <code className="attribute-hit__detail-value">{attribute.itemDataType}</code>
                        </div>
                    )}

                    {attribute.itemReferenceEntity && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Ссылается на</span>
                            <code className="attribute-hit__detail-value">
                                {attribute.itemReferenceEntity}
                            </code>
                        </div>
                    )}

                    {attribute.nestedAttributes && attribute.nestedAttributes.length > 0 && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">
                                Вложенные ({attribute.nestedAttributes.length})
                            </span>
                            <span className="attribute-hit__detail-value">
                                {attribute.nestedAttributes.map((n, i) => (
                                    <span key={n.id}>
                                        {i > 0 && ', '}
                                        <code>{n.id}</code>
                                        <span style={{ color: 'var(--text-500)' }}>: {n.dataType}</span>
                                    </span>
                                ))}
                            </span>
                        </div>
                    )}

                    {attribute.usedInViews > 0 && (
                        <div className="attribute-hit__detail-row">
                            <span className="attribute-hit__detail-label">Используется</span>
                            <span className="attribute-hit__detail-value">
                                в {attribute.usedInViews} виджет{attribute.usedInViews === 1 ? 'е' : 'ах'}
                            </span>
                        </div>
                    )}

                    <div className="attribute-hit__actions">
                        <button className="btn btn--primary" onClick={() => onOpenEntity(entity)}>
                            🎯 Открыть сущность в каталоге
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});