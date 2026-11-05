import React, { useState } from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useModelIndex } from '../../../hooks/useModelIndex';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section, SectionTabs } from '../Section';

type Tab = 'domains' | 'entities' | 'recent';

const MAX_FULL = 15;
const MAX_COMPACT = 6;

export function FavoritesSection() {
    const bookmarks = useGraphStore((s) => s.bookmarks);
    const entityFavorites = useGraphStore((s) => s.entityFavorites);
    const recent = useGraphStore((s) => s.recentEntities);
    const compact = useGraphStore((s) => s.sidebarCompact);
    const nodes = useGraphStore((s) => s.nodes);
    const { index } = useModelIndex();
    const { goto } = useNavigation();

    const [tab, setTab] = useState<Tab>(
        bookmarks.size > 0 ? 'domains' : entityFavorites.size > 0 ? 'entities' : 'recent',
    );

    const total = bookmarks.size + entityFavorites.size + recent.length;
    if (total === 0) return null;

    const limit = compact ? MAX_COMPACT : MAX_FULL;

    const openEntity = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const favoriteDomains = Array.from(bookmarks)
        .slice(0, limit)
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is NonNullable<typeof n> => !!n);

    const favoriteEntities = Array.from(entityFavorites)
        .slice(0, limit)
        .map((fqid) => {
            const entity = index?.entitiesByFqid[fqid];
            return entity ? { fqid, entity } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    const recentEntities = recent
        .slice(0, limit)
        .map((r) => {
            const entity = index?.entitiesByFqid[r.fqid];
            return entity ? { ...r, entity } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

    return (
        <Section
            id="favorites"
            title="Избранное"
            icon="star"
            badge={bookmarks.size + entityFavorites.size}
            right={
                <SectionTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    options={[
                        {
                            value: 'domains',
                            label: `Дом (${bookmarks.size})`,
                            icon: 'folder',
                        },
                        {
                            value: 'entities',
                            label: `Сущ (${entityFavorites.size})`,
                            icon: 'data_object',
                        },
                        {
                            value: 'recent',
                            label: `Недав (${recent.length})`,
                            icon: 'history',
                        },
                    ]}
                />
            }
        >
            {tab === 'domains' && (
                <div className="rank-list">
                    {favoriteDomains.length === 0 && (
                        <div className="rank-empty">Нет избранных доменов</div>
                    )}
                    {favoriteDomains.map((n) => (
                        <div
                            key={n.id}
                            className="rank-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => goto(n.data.domainId)}
                        >
                            <span className="rank-item__num">
                                <MIcon name="star" size="sm" fill />
                            </span>
                            <span className="rank-item__label">
                                {n.data.domainId}
                            </span>
                            <button
                                className="rank-item__remove"
                                onClick={(ev) => {
                                    ev.stopPropagation();
                                    useGraphStore.getState().toggleBookmark(n.id);
                                }}
                                title="Убрать из избранного"
                            >
                                <MIcon name="close" size="sm" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'entities' && (
                <div className="recent-entities">
                    {favoriteEntities.length === 0 && (
                        <div className="rank-empty">Нет избранных сущностей</div>
                    )}
                    {favoriteEntities.map((r) => (
                        <div
                            key={r.fqid}
                            className="recent-entity-item recent-entity-item--fav"
                        >
                            <button
                                className="recent-entity-item__open"
                                onClick={() => openEntity(r.fqid)}
                                title={r.fqid}
                            >
                                <MIcon name="star" size="sm" fill />
                                <span className="recent-entity-item__id">
                                    {r.entity.entityId}
                                </span>
                                <span className="recent-entity-item__domain">
                                    {r.entity.domainId}
                                </span>
                            </button>
                            <button
                                className="recent-entity-item__remove"
                                onClick={() =>
                                    useGraphStore
                                        .getState()
                                        .toggleEntityFavorite(r.fqid)
                                }
                                title="Убрать из избранного"
                            >
                                <MIcon name="close" size="sm" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'recent' && (
                <div className="recent-entities">
                    {recentEntities.length === 0 && (
                        <div className="rank-empty">История пуста</div>
                    )}
                    {recentEntities.map((r) => (
                        <button
                            key={r.fqid}
                            className="recent-entity-item"
                            onClick={() => openEntity(r.fqid)}
                            title={r.fqid}
                        >
                            <MIcon name="data_object" size="sm" />
                            <span className="recent-entity-item__id">
                                {r.entity.entityId}
                            </span>
                            <span className="recent-entity-item__domain">
                                {r.entity.domainId}
                            </span>
                        </button>
                    ))}
                    {recentEntities.length > 0 && (
                        <button
                            className="recent-entities__clear"
                            onClick={() =>
                                useGraphStore.getState().clearRecentEntities()
                            }
                            title="Очистить историю"
                        >
                            Очистить историю
                        </button>
                    )}
                </div>
            )}
        </Section>
    );
}