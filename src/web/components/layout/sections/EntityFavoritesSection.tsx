import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useModelIndex } from '../../../hooks/useModelIndex';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

const MAX_FULL = 15;
const MAX_COMPACT = 5;

export function EntityFavoritesSection() {
    const favorites = useGraphStore((s) => s.entityFavorites);
    const compact = useGraphStore((s) => s.sidebarCompact);
    const { index } = useModelIndex();

    if (favorites.size === 0) return null;

    const limit = compact ? MAX_COMPACT : MAX_FULL;
    const resolved = Array.from(favorites)
        .map((fqid) => {
            const entity = index?.entitiesByFqid[fqid];
            return entity ? { fqid, entity } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, limit);

    if (resolved.length === 0) return null;

    const openEntity = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    return (
        <Section
            id="entity-favorites"
            title="Избранные сущности"
            icon="star"
            badge={favorites.size}
        >
            <div className="recent-entities">
                {resolved.map((r) => (
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
                            onClick={() => {
                                useGraphStore
                                    .getState()
                                    .toggleEntityFavorite(r.fqid);
                            }}
                            title="Убрать из избранного"
                        >
                            <MIcon name="close" size="sm" />
                        </button>
                    </div>
                ))}
            </div>
        </Section>
    );
}