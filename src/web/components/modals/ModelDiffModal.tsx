import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelDiff } from '../../hooks/useModelDiff';
import { MIcon } from '../common/MIcon';
import type { DiffEntityChange, DiffEntityRef, DomainChangesSummary } from '../../../shared/model-types';

const GENERIC_SECTION_LABELS: Record<string, string> = {
    dataRules: "Правила данных",
    uiRules: "UI Rules",
    uiPresets: "UI Presets",
    views: "Представления",
    menus: "Меню",
    medias: "Иконки",
    trees: "Деревья",
    transitiveLinkages: "Транзитивные связи",
    permissions: "Разрешения",
    localizations: "Локализации",
};

function genericSectionLabel(key: string): string {
    return GENERIC_SECTION_LABELS[key] || key;
}

export function ModelDiffModal() {
    const store = useGraphStore();
    const { diff, hasSnapshot, loading, error } = useModelDiff();

    const [openSections, setOpenSections] = useState<Set<string>>(
        new Set(['domains', 'added', 'removed', 'changed'])
    );
    const [domainFilter, setDomainFilter] = useState<string>('');
    const [viewMode, setViewMode] = useState<'domain' | 'kind'>('domain');
    const byDomainFiltered = useMemo(() => {
        if (!diff) return [];
        if (!domainFilter) return diff.byDomain;
        const d = domainFilter.toLowerCase();
        return diff.byDomain.filter((s) => s.domainId.toLowerCase() === d);
    }, [diff, domainFilter]);

    const open = store.modelDiffOpen;

    const toggle = (id: string) => {
        setOpenSections((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return s;
        });
    };

    // Фильтр по домену
    const filtered = useMemo(() => {
        if (!diff) return null;
        if (!domainFilter) return diff;
        const d = domainFilter.toLowerCase();

        return {
            ...diff,
            entities: {
                added: diff.entities.added.filter((e) => e.domainId.toLowerCase() === d),
                removed: diff.entities.removed.filter((e) => e.domainId.toLowerCase() === d),
                changed: diff.entities.changed.filter((e) => e.domainId.toLowerCase() === d)
            },
            mixins: {
                added: diff.mixins.added.filter((m) => m.domainId.toLowerCase() === d),
                removed: diff.mixins.removed.filter((m) => m.domainId.toLowerCase() === d)
            },
            dataTypes: {
                added: diff.dataTypes.added.filter((x) => x.domainId.toLowerCase() === d),
                removed: diff.dataTypes.removed.filter((x) => x.domainId.toLowerCase() === d)
            },
            domains: {
                added: diff.domains.added.filter((x) => x.domainId.toLowerCase() === d),
                removed: diff.domains.removed.filter((x) => x.domainId.toLowerCase() === d),
                changed: diff.domains.changed.filter((x) => x.domainId.toLowerCase() === d)
            }
        };
    }, [diff, domainFilter]);

    // Уникальные домены в diff
    const allDomains = useMemo(() => {
        if (!diff) return [];
        const set = new Set<string>();
        diff.entities.added.forEach((e) => set.add(e.domainId));
        diff.entities.removed.forEach((e) => set.add(e.domainId));
        diff.entities.changed.forEach((e) => set.add(e.domainId));
        diff.mixins.added.forEach((m) => set.add(m.domainId));
        diff.mixins.removed.forEach((m) => set.add(m.domainId));
        return Array.from(set).sort();
    }, [diff]);

    const totalChanges = useMemo(() => {
        if (!diff) return 0;
        const s = diff.stats;
        return (
            s.entitiesAdded + s.entitiesRemoved + s.entitiesChanged +
            s.mixinsAdded + s.mixinsRemoved +
            s.dataTypesAdded + s.dataTypesRemoved +
            s.domainsAdded + s.domainsRemoved + s.domainsChanged +
            (s.genericAdded ?? 0) + (s.genericRemoved ?? 0) + (s.genericChanged ?? 0)
        );
    }, [diff]);

    if (!open) return null;

    return (
        <div
            className="help-overlay"
            onMouseDown={() => store.setModelDiffOpen(false)}
        >
            <div
                className="help-modal model-diff-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📋 Что изменилось в модели
                        {diff && totalChanges > 0 && (
                            <span className="help-modal__badge">{totalChanges}</span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setModelDiffOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="help-modal__body">
                    {loading && (
                        <div className="help-modal__loading">Загрузка diff...</div>
                    )}
                    {error && (
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    )}

                    {!loading && !error && !hasSnapshot && (
                        <div className="model-diff-empty">
                            <div className="model-diff-empty__icon">📸</div>
                            <div className="model-diff-empty__title">
                                Снапшот модели создан
                            </div>
                            <div className="model-diff-empty__hint">
                                Это первый запуск. Изменения станут видны после следующего обновления
                                доменов (<code>--refresh</code>) или правок в схемах.
                            </div>
                        </div>
                    )}

                    {!loading && !error && hasSnapshot && !diff && (
                        <div className="model-diff-empty">
                            <div className="model-diff-empty__icon">✅</div>
                            <div className="model-diff-empty__title">
                                Изменений нет
                            </div>
                            <div className="model-diff-empty__hint">
                                Снапшот существует, но с момента последнего изменения модели ничего не происходило.
                            </div>
                        </div>
                    )}

                    {!loading && !error && hasSnapshot && diff && (
                        <>
                            {/* Шапка с версиями */}
                            <div className="model-diff-versions">
                                <div className="model-diff-version">
                                    <div className="model-diff-version__label">Было</div>
                                    <div className="model-diff-version__date">
                                        {new Date(diff.previousGeneratedAt).toLocaleString('ru-RU', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                                <div className="model-diff-version__arrow">→</div>
                                <div className="model-diff-version">
                                    <div className="model-diff-version__label">Стало</div>
                                    <div className="model-diff-version__date">
                                        {new Date(diff.currentGeneratedAt).toLocaleString('ru-RU', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Фильтр по домену */}

                            {totalChanges > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
                                    <div className="model-diff-view-mode">
                                        <button
                                            className={'model-diff-view-btn' + (viewMode === 'domain' ? ' active' : '')}
                                            onClick={() => setViewMode('domain')}
                                        >
                                            По доменам ({byDomainFiltered.length})
                                        </button>
                                        <button
                                            className={'model-diff-view-btn' + (viewMode === 'kind' ? ' active' : '')}
                                            onClick={() => setViewMode('kind')}
                                        >
                                            По типам
                                        </button>
                                    </div>
                                    {allDomains.length > 0 && (
                                        <div className="model-diff-filter">
                                            <label>
                                                <span>Домен:</span>
                                                <select
                                                    value={domainFilter}
                                                    onChange={(e) => setDomainFilter(e.target.value)}
                                                >
                                                    <option value="">— все ({allDomains.length}) —</option>
                                                    {allDomains.map((d) => (
                                                        <option key={d} value={d}>{d}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            )}

                            {totalChanges === 0 && (
                                <div className="model-diff-no-changes">✅ Изменений нет</div>
                            )}

                            {/* ============ РЕЖИМ: ПО ДОМЕНАМ ============ */}
                            {viewMode === 'domain' && totalChanges > 0 && (
                                <div className="model-diff-domains">
                                    {byDomainFiltered.map((s) => (
                                        <DomainChangeCard key={s.domainId} summary={s} />
                                    ))}
                                </div>
                            )}

                            {/* ============ РЕЖИМ: ПО ТИПАМ (старый) ============ */}
                            {viewMode === 'kind' && totalChanges > 0 && filtered && (
                                <div className="model-diff-sections">



                                    {totalChanges > 0 && filtered && (
                                        <div className="model-diff-sections">
                                            {filtered.domains.changed.length > 0 && (
                                                <DiffSection
                                                    id="domains"
                                                    title="Метаданные доменов"
                                                    count={filtered.domains.changed.length}
                                                    color="changed"
                                                    open={openSections.has('domains')}
                                                    onToggle={() => toggle('domains')}
                                                >
                                                    {filtered.domains.changed.map((d) => (
                                                        <div key={d.domainId} className="model-diff-change">
                                                            <div className="model-diff-change__head">
                                                                <code className="model-diff-domain__id">{d.domainId}</code>
                                                                {d.name && d.name !== d.domainId && (
                                                                    <span className="model-diff-entity__name">{d.name}</span>
                                                                )}
                                                            </div>
                                                            <div className="model-diff-change__body">
                                                                {d.changes.map((c, i) => (
                                                                    <div key={i} className="model-diff-change__row">
                                                                        <span className="model-diff-change__label">{c.field}:</span>
                                                                        <span className="model-diff-change__from">{formatValue(c.from)}</span>
                                                                        <span className="model-diff-change__arrow">→</span>
                                                                        <span className="model-diff-change__to">{formatValue(c.to)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </DiffSection>
                                            )}

                                            {diff.genericSections && Object.keys(diff.genericSections).length > 0 && (
                                                <>
                                                    {Object.entries(diff.genericSections).map(([key, sectionDiff]) => {
                                                        const count =
                                                            sectionDiff.added.length +
                                                            sectionDiff.removed.length +
                                                            sectionDiff.changed.length;
                                                        if (count === 0) return null;
                                                        return (
                                                            <DiffSection
                                                                key={"generic-" + key}
                                                                id={"generic-" + key}
                                                                title={genericSectionLabel(key)}
                                                                count={count}
                                                                color="changed"
                                                                open={openSections.has("generic-" + key)}
                                                                onToggle={() => toggle("generic-" + key)}
                                                            >
                                                                {sectionDiff.added.map((e) => (
                                                                    <div
                                                                        key={"+" + e.domainId + "#" + e.id}
                                                                        className="model-diff-item model-diff-item--added"
                                                                    >
                                                                        <span className="model-diff-item__sign">+</span>
                                                                        <code>{e.id}</code>
                                                                        <span className="model-diff-item__meta">{e.domainId}</span>
                                                                        {e.type && (
                                                                            <span className="model-diff-item__meta">{e.type}</span>
                                                                        )}
                                                                        {e.label && (
                                                                            <span className="model-diff-item__meta">{e.label}</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {sectionDiff.removed.map((e) => (
                                                                    <div
                                                                        key={"-" + e.domainId + "#" + e.id}
                                                                        className="model-diff-item model-diff-item--removed"
                                                                    >
                                                                        <span className="model-diff-item__sign">−</span>
                                                                        <code>{e.id}</code>
                                                                        <span className="model-diff-item__meta">{e.domainId}</span>
                                                                        {e.type && (
                                                                            <span className="model-diff-item__meta">{e.type}</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {sectionDiff.changed.map((e) => (
                                                                    <div
                                                                        key={"~" + e.domainId + "#" + e.id}
                                                                        className="model-diff-item"
                                                                    >
                                                                        <span className="model-diff-item__sign" style={{ color: "#fbbf24" }}>
                                                                            ~
                                                                        </span>
                                                                        <code>{e.id}</code>
                                                                        <span className="model-diff-item__meta">{e.domainId}</span>
                                                                        {e.type && (
                                                                            <span className="model-diff-item__meta">{e.type}</span>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </DiffSection>
                                                        );
                                                    })}
                                                </>
                                            )}

                                            {/* + Сущности */}
                                            {filtered.entities.added.length > 0 && (
                                                <DiffSection
                                                    id="added"
                                                    title="Добавлены сущности"
                                                    count={filtered.entities.added.length}
                                                    color="added"
                                                    open={openSections.has('added')}
                                                    onToggle={() => toggle('added')}
                                                >
                                                    {filtered.entities.added.map((e) => (
                                                        <DiffEntityRow key={e.fqid} entity={e} />
                                                    ))}
                                                </DiffSection>
                                            )}

                                            {/* − Сущности */}
                                            {filtered.entities.removed.length > 0 && (
                                                <DiffSection
                                                    id="removed"
                                                    title="Удалены сущности"
                                                    count={filtered.entities.removed.length}
                                                    color="removed"
                                                    open={openSections.has('removed')}
                                                    onToggle={() => toggle('removed')}
                                                >
                                                    {filtered.entities.removed.map((e) => (
                                                        <DiffEntityRow key={e.fqid} entity={e} />
                                                    ))}
                                                </DiffSection>
                                            )}

                                            {/* ~ Сущности */}
                                            {filtered.entities.changed.length > 0 && (
                                                <DiffSection
                                                    id="changed"
                                                    title="Изменены сущности"
                                                    count={filtered.entities.changed.length}
                                                    color="changed"
                                                    open={openSections.has('changed')}
                                                    onToggle={() => toggle('changed')}
                                                >
                                                    {filtered.entities.changed.map((c) => (
                                                        <DiffChangedEntity key={c.fqid} change={c} />
                                                    ))}
                                                </DiffSection>
                                            )}

                                            {/* Миксины */}
                                            {(filtered.mixins.added.length > 0 || filtered.mixins.removed.length > 0) && (
                                                <DiffSection
                                                    id="mixins"
                                                    title="Миксины"
                                                    count={filtered.mixins.added.length + filtered.mixins.removed.length}
                                                    color="changed"
                                                    open={openSections.has('mixins')}
                                                    onToggle={() => toggle('mixins')}
                                                >
                                                    {filtered.mixins.added.map((m) => (
                                                        <div key={`+${m.domainId}#${m.id}`} className="model-diff-item model-diff-item--added">
                                                            <span className="model-diff-item__sign">+</span>
                                                            <code>{m.id}</code>
                                                            <span className="model-diff-item__meta">{m.domainId} → {m.targetEntityFqid.split('/')[1]}</span>
                                                        </div>
                                                    ))}
                                                    {filtered.mixins.removed.map((m) => (
                                                        <div key={`-${m.domainId}#${m.id}`} className="model-diff-item model-diff-item--removed">
                                                            <span className="model-diff-item__sign">−</span>
                                                            <code>{m.id}</code>
                                                            <span className="model-diff-item__meta">{m.domainId} → {m.targetEntityFqid.split('/')[1]}</span>
                                                        </div>
                                                    ))}
                                                </DiffSection>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Универсальный переход: закрыть diff → открыть каталог на нужной сущности. */
function gotoEntityInCatalog(
    store: ReturnType<typeof useGraphStore.getState>,
    fqid: string
): void {
    store.setModelDiffOpen(false);
    store.setEntityCatalogInitialFqid(fqid);
    store.setEntityCatalogOpen(true);
}

// ============ Подкомпоненты ============

function DiffSection({
    id,
    title,
    count,
    color,
    open,
    onToggle,
    children
}: {
    id: string;
    title: string;
    count: number;
    color: 'added' | 'removed' | 'changed';
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className={'model-diff-section model-diff-section--' + color}>
            <button className="model-diff-section__header" onClick={onToggle}>
                <MIcon name={open ? 'expand_more' : 'chevron_right'} size="sm" />
                <span className="model-diff-section__title">{title}</span>
                <span className="model-diff-section__count">{count}</span>
            </button>
            {open && <div className="model-diff-section__body">{children}</div>}
        </div>
    );
}

function DiffEntityRow({ entity }: { entity: DiffEntityRef }) {
    const setModelDiffOpen = useGraphStore((s) => s.setModelDiffOpen);
    const setEntityCatalogInitialFqid = useGraphStore((s) => s.setEntityCatalogInitialFqid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);

    return (
        <div className="model-diff-entity">
            <button
                className="model-diff-entity__id"
                onClick={() => {
                    setModelDiffOpen(false);
                    setEntityCatalogInitialFqid(entity.fqid);
                    setEntityCatalogOpen(true);
                }}
            >
                {entity.entityId}
            </button>
            <span className="model-diff-entity__domain">{entity.domainId}</span>
            {entity.name !== entity.entityId && (
                <span className="model-diff-entity__name">{entity.name}</span>
            )}
        </div>
    );
}

function DiffChangedEntity({ change }: { change: DiffEntityChange }) {
    const setModelDiffOpen = useGraphStore((s) => s.setModelDiffOpen);
    const setEntityCatalogInitialFqid = useGraphStore((s) => s.setEntityCatalogInitialFqid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);
    return (
        <div className="model-diff-change">
            <div className="model-diff-change__head">
                <button
                    className="model-diff-entity__id"
                    onClick={() => {
                        setModelDiffOpen(false);
                        setEntityCatalogInitialFqid(change.fqid);
                        setEntityCatalogOpen(true);
                    }}
                >
                    {change.entityId}
                </button>
                <span className="model-diff-entity__domain">{change.domainId}</span>
            </div>

            <div className="model-diff-change__body">
                {change.inheritsChange && (
                    <div className="model-diff-change__row">
                        <span className="model-diff-change__label">inherits:</span>
                        <code className="model-diff-change__from">
                            {change.inheritsChange.from || '—'}
                        </code>
                        <span className="model-diff-change__arrow">→</span>
                        <code className="model-diff-change__to">
                            {change.inheritsChange.to || '—'}
                        </code>
                    </div>
                )}

                {change.nameChange && (
                    <div className="model-diff-change__row">
                        <span className="model-diff-change__label">name:</span>
                        <span className="model-diff-change__from">{change.nameChange.from}</span>
                        <span className="model-diff-change__arrow">→</span>
                        <span className="model-diff-change__to">{change.nameChange.to}</span>
                    </div>
                )}

                {change.attributesAdded.length > 0 && (
                    <div className="model-diff-change__row model-diff-change__row--stack">
                        <span className="model-diff-change__label">+ атрибуты:</span>
                        <div className="model-diff-change__chips">
                            {change.attributesAdded.map((a) => (
                                <code key={a.id} className="model-diff-chip model-diff-chip--added">
                                    {a.id}
                                    <span className="model-diff-chip__type">{a.dataType}</span>
                                </code>
                            ))}
                        </div>
                    </div>
                )}

                {change.attributesRemoved.length > 0 && (
                    <div className="model-diff-change__row model-diff-change__row--stack">
                        <span className="model-diff-change__label">− атрибуты:</span>
                        <div className="model-diff-change__chips">
                            {change.attributesRemoved.map((a) => (
                                <code key={a.id} className="model-diff-chip model-diff-chip--removed">
                                    {a.id}
                                </code>
                            ))}
                        </div>
                    </div>
                )}

                {change.attributesChanged.length > 0 && (
                    <div className="model-diff-change__row model-diff-change__row--stack">
                        <span className="model-diff-change__label">~ атрибуты:</span>
                        <div className="model-diff-change__attr-changes">
                            {change.attributesChanged.map((ac) => (
                                <div key={ac.id} className="model-diff-attr-change">
                                    <code className="model-diff-attr-change__id">{ac.id}</code>
                                    <div className="model-diff-attr-change__fields">
                                        {Object.entries(ac.changes).map(([field, { from, to }]) => (
                                            <div key={field} className="model-diff-field-change">
                                                <span className="model-diff-field-change__name">{field}:</span>
                                                <span className="model-diff-field-change__from">
                                                    {formatValue(from)}
                                                </span>
                                                <span className="model-diff-field-change__arrow">→</span>
                                                <span className="model-diff-field-change__to">
                                                    {formatValue(to)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function DomainChangeCard({ summary }: { summary: DomainChangesSummary }) {
    const [open, setOpen] = useState(true);
    const store = useGraphStore((s) => s);

    const setModelDiffOpen = useGraphStore((s) => s.setModelDiffOpen);
    const setEntityCatalogInitialFqid = useGraphStore((s) => s.setEntityCatalogInitialFqid);
    const setEntityCatalogOpen = useGraphStore((s) => s.setEntityCatalogOpen);

    const openEntity = (fqid: string) => {
        setModelDiffOpen(false);
        setEntityCatalogInitialFqid(fqid);
        setEntityCatalogOpen(true);
    };

    return (
        <div className="model-diff-domain">
            <button
                className="model-diff-domain__head"
                onClick={() => setOpen(!open)}
            >
                <MIcon name={open ? 'expand_more' : 'chevron_right'} size="sm" />
                <code className="model-diff-domain__id">{summary.domainId}</code>
                {summary.version && (
                    <span className="model-diff-domain__version">v{summary.version}</span>
                )}
                <span className="model-diff-domain__count">{summary.totalChanges}</span>
            </button>

            {open && (
                <div className="model-diff-domain__body">
                    {/* Metadata changes */}
                    {summary.metadataChanges.length > 0 && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title">Метаданные</div>
                            {summary.metadataChanges.map((c, i) => (
                                <div key={i} className="model-diff-change__row">
                                    <span className="model-diff-change__label">{c.field}:</span>
                                    <span className="model-diff-change__from">{formatValue(c.from)}</span>
                                    <span className="model-diff-change__arrow">→</span>
                                    <span className="model-diff-change__to">{formatValue(c.to)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {summary.generic && Object.keys(summary.generic).length > 0 && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title">Прочие секции</div>
                            {Object.entries(summary.generic).map(([key, sectionDiff]) => {
                                const count =
                                    sectionDiff.added.length +
                                    sectionDiff.removed.length +
                                    sectionDiff.changed.length;
                                if (count === 0) return null;
                                return (
                                    <div key={key} className="model-diff-domain__group" style={{ marginTop: 6 }}>
                                        <div className="model-diff-domain__group-title" style={{ fontSize: 10 }}>
                                            {genericSectionLabel(key)} ({count})
                                        </div>
                                        {sectionDiff.added.map((e) => (
                                            <div
                                                key={"+" + e.id}
                                                className="model-diff-item model-diff-item--added"
                                            >
                                                <span className="model-diff-item__sign">+</span>
                                                <code>{e.id}</code>
                                                {e.type && (
                                                    <span className="model-diff-item__meta">{e.type}</span>
                                                )}
                                            </div>
                                        ))}
                                        {sectionDiff.removed.map((e) => (
                                            <div
                                                key={"-" + e.id}
                                                className="model-diff-item model-diff-item--removed"
                                            >
                                                <span className="model-diff-item__sign">−</span>
                                                <code>{e.id}</code>
                                            </div>
                                        ))}
                                        {sectionDiff.changed.map((e) => (
                                            <div key={"~" + e.id} className="model-diff-item">
                                                <span
                                                    className="model-diff-item__sign"
                                                    style={{ color: "#fbbf24" }}
                                                >
                                                    ~
                                                </span>
                                                <code>{e.id}</code>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Entities added */}
                    {summary.entitiesAdded.length > 0 && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title model-diff-domain__group-title--added">
                                + Добавлены сущности ({summary.entitiesAdded.length})
                            </div>
                            {summary.entitiesAdded.map((e) => (
                                <div key={e.fqid} className="model-diff-item model-diff-item--added">
                                    <span className="model-diff-item__sign">+</span>
                                    <button
                                        className="model-diff-entity__id"
                                        onClick={() => openEntity(e.fqid)}
                                    >
                                        {e.entityId}
                                    </button>
                                    {e.name !== e.entityId && (
                                        <span className="model-diff-item__meta">{e.name}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Entities removed */}
                    {summary.entitiesRemoved.length > 0 && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title model-diff-domain__group-title--removed">
                                − Удалены сущности ({summary.entitiesRemoved.length})
                            </div>
                            {summary.entitiesRemoved.map((e) => (
                                <div key={e.fqid} className="model-diff-item model-diff-item--removed">
                                    <span className="model-diff-item__sign">−</span>
                                    <span className="model-diff-entity__id" style={{ textDecoration: 'line-through', opacity: 0.7 }}>
                                        {e.entityId}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Entities changed */}
                    {summary.entitiesChanged.length > 0 && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title model-diff-domain__group-title--changed">
                                ~ Изменены сущности ({summary.entitiesChanged.length})
                            </div>
                            {summary.entitiesChanged.map((c) => (
                                <DiffChangedEntity key={c.fqid} change={c} />
                            ))}
                        </div>
                    )}

                    {/* Mixins */}
                    {(summary.mixinsAdded.length > 0 || summary.mixinsRemoved.length > 0) && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title">Миксины</div>
                            {summary.mixinsAdded.map((m) => (
                                <div key={'+' + m.id} className="model-diff-item model-diff-item--added">
                                    <span className="model-diff-item__sign">+</span>
                                    <code>{m.id}</code>
                                    <span className="model-diff-item__meta">→ {m.targetEntityFqid.split('/')[1]}</span>
                                </div>
                            ))}
                            {summary.mixinsRemoved.map((m) => (
                                <div key={'-' + m.id} className="model-diff-item model-diff-item--removed">
                                    <span className="model-diff-item__sign">−</span>
                                    <code>{m.id}</code>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Data types */}
                    {(summary.dataTypesAdded.length > 0 || summary.dataTypesRemoved.length > 0) && (
                        <div className="model-diff-domain__group">
                            <div className="model-diff-domain__group-title">Типы данных</div>
                            {summary.dataTypesAdded.map((d) => (
                                <div key={'+' + d.id} className="model-diff-item model-diff-item--added">
                                    <span className="model-diff-item__sign">+</span>
                                    <code>{d.id}</code>
                                    <span className="model-diff-item__meta">{d.kind}</span>
                                </div>
                            ))}
                            {summary.dataTypesRemoved.map((d) => (
                                <div key={'-' + d.id} className="model-diff-item model-diff-item--removed">
                                    <span className="model-diff-item__sign">−</span>
                                    <code>{d.id}</code>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatValue(v: any): string {
    if (v === null || v === undefined) return '—';
    if (Array.isArray(v)) return v.join(', ') || '(пусто)';
    return String(v);
}