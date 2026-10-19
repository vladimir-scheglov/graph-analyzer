import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import {
    EntityFilters,
    EMPTY_FILTERS,
    countRefs,
    filterEntities
} from '../../lib/model/entity-filters';
import { ImpactAnalysisPanel } from './ImpactAnalysisPanel';
import type { EntityRecord, ModelIndex } from '../../../shared/model-types';

const PAGE_SIZE = 300;

// ============ Строка таблицы (memo, не ре-рендерится при hover соседей) ============

interface EntityRowProps {
    entity: EntityRecord;
    index: ModelIndex;
    isOrphan: boolean;
    isFav: boolean;
    onSelect: (fqid: string) => void;
    onToggleFav: (fqid: string) => void;
}

const EntityRow = React.memo(function EntityRow({
    entity,
    index,
    isOrphan,
    isFav,
    onSelect,
    onToggleFav
}: EntityRowProps) {
    const refs = countRefs(entity, index);
    return (
        <tr
            className={'entity-catalog-row' + (isOrphan ? ' orphan' : '')}
            onClick={() => onSelect(entity.fqid)}
        >
            <td className="entity-catalog-cell-fav">
                <button
                    className={'entity-catalog-fav' + (isFav ? ' active' : '')}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleFav(entity.fqid);
                    }}
                    title={isFav ? 'Убрать из избранного' : 'В избранное'}
                >
                    <MIcon name={isFav ? 'star' : 'star_border'} size="sm" fill={isFav} />
                </button>
            </td>
            <td>
                <div className="entity-catalog-cell-id">{entity.entityId}</div>
                {entity.name !== entity.entityId && (
                    <div className="entity-catalog-cell-name">{entity.name}</div>
                )}
            </td>
            <td className="entity-catalog-cell-mono">{entity.domainId}</td>
            <td className="entity-catalog-cell-mono">
                {entity.inherits ? entity.inherits.split('/')[1] : '—'}
            </td>
            <td className="entity-catalog-cell-num">{entity.attributes.length}</td>
            <td className="entity-catalog-cell-num">
                <span className={refs > 0 ? 'ref-badge' : 'ref-badge ref-badge--zero'}>
                    {refs}
                </span>
            </td>
            <td className="entity-catalog-cell-num">
                {entity.mixinSources.length > 0 ? (
                    <span className="mixin-badge">{entity.mixinSources.length}</span>
                ) : (
                    '—'
                )}
            </td>
            <td>
                {entity.domainTags.slice(0, 2).map((t) => (
                    <span key={t} className="entity-catalog-tag">
                        {t}
                    </span>
                ))}
            </td>
        </tr>
    );
});

// ============ Главная модалка ============

export function EntitiesCatalogModal() {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();

    const [filters, setFilters] = useState<EntityFilters>(EMPTY_FILTERS);
    const [selectedFqid, setSelectedFqid] = useState<string | null>(null);
    const [limit, setLimit] = useState(PAGE_SIZE);

    const open = store.entityCatalogOpen;
    const entityFavorites = useGraphStore((s) => s.entityFavorites);
    const initialFqid = store.entityCatalogInitialFqid;

    // ============ Автовыбор сущности при открытии через «Открыть в каталоге» ============
    useEffect(() => {
        if (!open) return;
        if (!initialFqid) return;
        if (!index) return;
        // Сбрасываем поиск и фильтры, чтобы целевая сущность была видна
        setFilters(EMPTY_FILTERS);
        setLimit(PAGE_SIZE);
        setSelectedFqid(initialFqid);
        store.setEntityCatalogInitialFqid(null);
    }, [open, initialFqid, index, store]);

    // Трекинг «недавно открытых» — сюда стекаются все переходы
    // через setEntityCatalogInitialFqid из других модалок.
    useEffect(() => {
        if (!selectedFqid) return;
        useGraphStore.getState().pushRecentEntity(selectedFqid);
    }, [selectedFqid]);

    // Сброс лимита при смене фильтров
    useEffect(() => {
        setLimit(PAGE_SIZE);
    }, [filters]);

    // ============ Set для orphan — O(1) вместо includes ============
    const orphanSet = useMemo(() => {
        if (!index) return new Set<string>();
        return new Set(index.stats.orphanEntities);
    }, [index]);

    // ============ Фильтрация ============
    const filtered = useMemo(
        () => (index ? filterEntities(index, filters) : []),
        [index, filters]
    );

    const visibleRows = useMemo(
        () => filtered.slice(0, limit),
        [filtered, limit]
    );

    // ============ Списки для фильтров ============
    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const allTags = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            e.domainTags.forEach((t) => {
                const key = String(t).toLowerCase();
                map.set(key, (map.get(key) || 0) + 1);
            });
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    // ============ Стабильные колбэки для memo-строк ============
    const handleSelectRow = useCallback((fqid: string) => {
        setSelectedFqid(fqid);
    }, []);

    const handleToggleFav = useCallback((fqid: string) => {
        useGraphStore.getState().toggleEntityFavorite(fqid);
    }, []);

    const handleBack = useCallback(() => {
        setSelectedFqid(null);
    }, []);

    const handleGotoDomain = useCallback(
        (domainId: string) => {
            store.setEntityCatalogOpen(false);
            store.setDomainSchemaDomainId(domainId);
            store.setDomainSchemaOpen(true);
        },
        [store]
    );

    const handleSelectFromImpact = useCallback((fqid: string) => {
        setSelectedFqid(fqid);
    }, []);

    const toggleDomainFilter = useCallback((domainId: string) => {
        setFilters((prev) => {
            const next = new Set(prev.domains);
            const key = domainId.toLowerCase();
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return { ...prev, domains: next };
        });
    }, []);

    const toggleTagFilter = useCallback((tag: string) => {
        setFilters((prev) => {
            const next = new Set(prev.tags);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return { ...prev, tags: next };
        });
    }, []);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setEntityCatalogOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📖 Каталог сущностей
                        {index && (
                            <span className="help-modal__badge">
                                {filtered.length} / {index.entities.length}
                            </span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setEntityCatalogOpen(false)}
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
                        {/* ============ ЛЕВАЯ ПАНЕЛЬ: ФИЛЬТРЫ ============ */}
                        <div className="entity-catalog-filters">
                            <div className="entity-search-input-wrap">
                                <span className="entity-search-icon">🔍</span>
                                <input
                                    className="entity-search-input"
                                    type="text"
                                    placeholder="Поиск: id, имя, описание, атрибуты..."
                                    value={filters.query}
                                    onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                                />
                            </div>

                            <div className="entity-catalog-filter-body">
                                {/* Домены */}
                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">Домены</div>
                                    <div className="entity-catalog-chips">
                                        {allDomains.slice(0, 30).map(([domainId, count]) => {
                                            const active = filters.domains.has(domainId.toLowerCase());
                                            return (
                                                <button
                                                    key={domainId}
                                                    className={'entity-catalog-chip' + (active ? ' active' : '')}
                                                    onClick={() => toggleDomainFilter(domainId)}
                                                >
                                                    {domainId}
                                                    <span className="entity-catalog-chip__count">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Теги */}
                                {allTags.length > 0 && (
                                    <div className="entity-catalog-group">
                                        <div className="entity-catalog-group__title">Теги</div>
                                        <div className="entity-catalog-chips">
                                            {allTags.slice(0, 20).map(([tag, count]) => {
                                                const active = filters.tags.has(tag);
                                                return (
                                                    <button
                                                        key={tag}
                                                        className={'entity-catalog-chip' + (active ? ' active' : '')}
                                                        onClick={() => toggleTagFilter(tag)}
                                                    >
                                                        {tag}
                                                        <span className="entity-catalog-chip__count">{count}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Свойства */}
                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">Свойства</div>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.hasInherits}
                                            onChange={() =>
                                                setFilters({ ...filters, hasInherits: !filters.hasInherits })
                                            }
                                        />
                                        Только с родителем
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.hasMixins}
                                            onChange={() =>
                                                setFilters({ ...filters, hasMixins: !filters.hasMixins })
                                            }
                                        />
                                        Только с миксинами
                                    </label>
                                    <label className="entity-catalog-toggle">
                                        <input
                                            type="checkbox"
                                            checked={filters.onlyOrphans}
                                            onChange={() =>
                                                setFilters({ ...filters, onlyOrphans: !filters.onlyOrphans })
                                            }
                                        />
                                        Только сироты ({index.stats.orphanEntities.length})
                                    </label>
                                </div>

                                {/* Мин. ссылок */}
                                <div className="entity-catalog-group">
                                    <div className="entity-catalog-group__title">
                                        Минимум ссылок: {filters.minRefs}
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={20}
                                        value={filters.minRefs}
                                        onChange={(e) =>
                                            setFilters({ ...filters, minRefs: parseInt(e.target.value, 10) })
                                        }
                                        style={{ width: '100%' }}
                                    />
                                </div>

                                <button
                                    className="btn"
                                    style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                                    onClick={() => setFilters(EMPTY_FILTERS)}
                                >
                                    Сбросить фильтры
                                </button>

                                {/* Алерты */}
                                {index.stats.circularInheritance.length > 0 && (
                                    <div className="entity-catalog-alert entity-catalog-alert--warn">
                                        ⚠️ Наследование в цикле: {index.stats.circularInheritance.length}
                                    </div>
                                )}
                                {index.stats.unknownReferences.length > 0 && (
                                    <div className="entity-catalog-alert entity-catalog-alert--err">
                                        ❌ Битых ссылок: {index.stats.unknownReferences.length}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ============ ПРАВАЯ ПАНЕЛЬ: ТАБЛИЦА ИЛИ IMPACT ============ */}
                        <div className="entity-catalog-panel">
                            {!selectedFqid ? (
                                <div className="entity-catalog-table-wrap">
                                    <table className="entity-catalog-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 32 }}></th>
                                                <th>Сущность</th>
                                                <th>Домен</th>
                                                <th>Наследует</th>
                                                <th>Атрибутов</th>
                                                <th>Ссылок</th>
                                                <th>Миксины</th>
                                                <th>Теги</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleRows.map((e) => (
                                                <EntityRow
                                                    key={e.fqid}
                                                    entity={e}
                                                    index={index}
                                                    isOrphan={orphanSet.has(e.fqid)}
                                                    onSelect={handleSelectRow}
                                                    isFav={entityFavorites.has(e.fqid)}
                                                    onToggleFav={handleToggleFav}
                                                />
                                            ))}
                                        </tbody>
                                    </table>

                                    {filtered.length === 0 && (
                                        <div className="entity-catalog-empty">Ничего не найдено</div>
                                    )}

                                    {filtered.length > visibleRows.length && (
                                        <div className="entity-catalog-more">
                                            Показано {visibleRows.length} из {filtered.length}
                                            <button
                                                className="btn"
                                                style={{ marginLeft: 12 }}
                                                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                                            >
                                                Показать ещё {PAGE_SIZE} (осталось{' '}
                                                {filtered.length - visibleRows.length})
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <ImpactAnalysisPanel
                                    fqid={selectedFqid}
                                    index={index}
                                    onBack={handleBack}
                                    onGotoDomain={handleGotoDomain}
                                    onSelectEntity={handleSelectFromImpact}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}