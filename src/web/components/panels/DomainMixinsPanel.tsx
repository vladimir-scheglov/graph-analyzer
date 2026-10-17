import React, { useState } from 'react';
import { MIcon } from '../common/MIcon';
import { useDomainMixins } from '../../hooks/useDomainMixins';
import { useNavigation } from '../../hooks/useNavigation';
import { useGraphStore } from '../../state/useGraphStore';

export interface DomainMixinsPanelProps {
    domainId: string;
}

export function DomainMixinsPanel({ domainId }: DomainMixinsPanelProps) {
    const { data, loading, error } = useDomainMixins(domainId);
    const { goto } = useNavigation();
    const store = useGraphStore();

    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (source: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(source)) next.delete(source);
            else next.add(source);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="details__field-value" style={{ color: 'var(--text-500)' }}>
                Загрузка индекса...
            </div>
        );
    }

    if (error) {
        return (
            <div className="details__field-value" style={{ color: 'var(--danger)' }}>
                Ошибка: {error}
            </div>
        );
    }

    if (!data || data.stats.totalMixins === 0) {
        return (
            <div className="details__field-value" style={{ color: 'var(--text-500)' }}>
                Этот домен не расширяется миксинами
            </div>
        );
    }

    return (
        <div className="domain-mixins">
            {/* Сводка */}
            <div className="domain-mixins__summary">
                <div className="domain-mixins__summary-item">
                    <span className="domain-mixins__summary-value">
                        {data.stats.affectedEntitiesCount}
                    </span>
                    <span className="domain-mixins__summary-label">сущностей затронуто</span>
                </div>
                <div className="domain-mixins__summary-item">
                    <span className="domain-mixins__summary-value">
                        {data.stats.totalSourceDomains}
                    </span>
                    <span className="domain-mixins__summary-label">источников</span>
                </div>
            </div>

            {/* Конфликты */}
            {data.stats.conflicts.length > 0 && (
                <div className="domain-mixins__alert domain-mixins__alert--warn">
                    <MIcon name="warning" size="sm" />
                    <span>
                        Конфликтов: {data.stats.conflicts.length} — вкладки добавляются из нескольких
                        миксинов
                    </span>
                </div>
            )}

            {/* Heavy targets — топ сущностей по миксинам */}
            {data.stats.heavyTargets.length > 0 && (
                <div className="domain-mixins__heavy">
                    <div className="domain-mixins__subtitle">Сущности с 2+ миксинами</div>
                    {data.stats.heavyTargets.slice(0, 5).map(({ entity, mixinCount }) => (
                        <button
                            key={entity.fqid}
                            className="rank-item"
                            onClick={() => {
                                store.setEntityCatalogInitialFqid(entity.fqid);
                                store.setEntityCatalogOpen(true);
                            }}
                        >
                            <span className="rank-item__num">{mixinCount}</span>
                            <span className="rank-item__label">{entity.entityId}</span>
                            <span className="rank-item__value">миксинов</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Группы по домену-источнику */}
            <div className="domain-mixins__groups">
                {data.groups.map((g) => {
                    const isOpen = expandedGroups.has(g.sourceDomain);
                    return (
                        <div
                            key={g.sourceDomain}
                            className={'domain-mixins__group' + (isOpen ? ' open' : '')}
                        >
                            <button
                                className="domain-mixins__group-header"
                                onClick={() => toggleGroup(g.sourceDomain)}
                            >
                                <span className="domain-mixins__chevron">{isOpen ? '▾' : '▸'}</span>
                                <span className="domain-mixins__source">{g.sourceDomain}</span>
                                <span className="domain-mixins__counts">
                                    {g.mixins.length} микс.
                                    {g.totalTabs > 0 && ` · ${g.totalTabs} вкл.`}
                                    {g.totalComponents > 0 && ` · ${g.totalComponents} комп.`}
                                </span>
                            </button>

                            {isOpen && (
                                <div className="domain-mixins__group-body">
                                    {/* Миксины */}
                                    {g.mixins.map((m) => (
                                        <div key={`${m.id}`} className="domain-mixins__mixin">
                                            <div className="domain-mixins__mixin-head">
                                                <code className="domain-mixins__mixin-id">{m.id}</code>
                                                <span className="domain-mixins__mixin-type">{m.type}</span>
                                                {m.changeAction === 'replace' && (
                                                    <span className="domain-mixins__mixin-badge">replace</span>
                                                )}
                                            </div>

                                            <div className="domain-mixins__mixin-target">
                                                →{' '}
                                                <button
                                                    className="domain-mixins__entity-link"
                                                    onClick={() => {
                                                        store.setEntityCatalogInitialFqid(m.targetEntityFqid);
                                                        store.setEntityCatalogOpen(true);
                                                    }}
                                                >
                                                    {m.targetEntityFqid.split('/')[1]}
                                                </button>
                                                {m.targetPanel && (
                                                    <span className="domain-mixins__target-panel">
                                                        {' '}
                                                        панель <code>{m.targetPanel}</code>
                                                    </span>
                                                )}
                                                {m.targetTab && (
                                                    <span className="domain-mixins__target-panel">
                                                        {' '}
                                                        вкладка <code>{m.targetTab}</code>
                                                    </span>
                                                )}
                                            </div>

                                            {m.addedTabs.length > 0 && (
                                                <div className="domain-mixins__adds">
                                                    <span className="domain-mixins__adds-label">Вкладки:</span>
                                                    <div className="domain-mixins__chips">
                                                        {m.addedTabs.map((t) => (
                                                            <code key={t} className="domain-mixins__chip">
                                                                {t}
                                                            </code>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {m.addedBlocks.length > 0 && (
                                                <div className="domain-mixins__adds">
                                                    <span className="domain-mixins__adds-label">Блоки:</span>
                                                    <div className="domain-mixins__chips">
                                                        {m.addedBlocks.map((b) => (
                                                            <code key={b} className="domain-mixins__chip">
                                                                {b}
                                                            </code>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {m.addedComponents.length > 0 && (
                                                <div className="domain-mixins__adds">
                                                    <span className="domain-mixins__adds-label">Компоненты:</span>
                                                    <span className="domain-mixins__count-only">
                                                        {m.addedComponents.length}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Сущности-получатели */}
                                    <div className="domain-mixins__targets">
                                        <span className="domain-mixins__adds-label">Затронуты:</span>
                                        <div className="domain-mixins__chips">
                                            {g.targetEntities.map((e) => (
                                                <button
                                                    key={e.fqid}
                                                    className="domain-mixins__chip domain-mixins__chip--entity"
                                                    onClick={() => {
                                                        store.setEntityCatalogInitialFqid(e.fqid);
                                                        store.setEntityCatalogOpen(true);
                                                    }}
                                                >
                                                    {e.entityId}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Перейти к домену-источнику */}
                                    <div className="domain-mixins__actions">
                                        <button
                                            className="btn"
                                            onClick={() => goto(g.sourceDomain)}
                                        >
                                            🎯 Перейти к домену
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}