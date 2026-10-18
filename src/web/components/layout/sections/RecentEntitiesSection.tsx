import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useModelIndex } from '../../../hooks/useModelIndex';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

const MAX_FULL = 10;
const MAX_COMPACT = 5;

export function RecentEntitiesSection() {
    const recent = useGraphStore((s) => s.recentEntities);
    const compact = useGraphStore((s) => s.sidebarCompact);
    const { index } = useModelIndex();

    if (recent.length === 0) return null;

    const limit = compact ? MAX_COMPACT : MAX_FULL;
    const resolved = recent
        .map((r) => {
            const entity = index?.entitiesByFqid[r.fqid];
            return entity ? { ...r, entity } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .slice(0, limit);

    if (resolved.length === 0) return null;

    const openEntity = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const clear = () => {
        useGraphStore.getState().clearRecentEntities();
    };

    return (
        <Section
            id="recent-entities"
            title="Недавние сущности"
            icon="history"
            badge={recent.length}
        >
            <div className="recent-entities">
                {resolved.map((r) => (
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
                <button
                    className="recent-entities__clear"
                    onClick={clear}
                    title="Очистить историю недавних сущностей"
                >
                    Очистить историю
                </button>
            </div>
        </Section>
    );
}