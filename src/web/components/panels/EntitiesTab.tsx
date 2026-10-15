import React from 'react';
import type { EntityIndex, EntityRecord } from '../../lib/types';

export interface EntitiesTabProps {
    node: any;
    entities: EntityRecord[];
    entityIndex: EntityIndex | null;
    onOpenEntityHierarchy: (key: string) => void;
}

export function EntitiesTab({ node, entities, entityIndex, onOpenEntityHierarchy }: EntitiesTabProps) {
    const domainEntities = entities.filter(
        (e) => e.domainId === (node && node.data && node.data.domainId)
    );

    return (
        <div className="details">
            <div className="details__field-label">
                Сущности домена ({domainEntities.length})
            </div>

            {domainEntities.length === 0 ? (
                <div className="details__field-value" style={{ color: 'var(--text-500)' }}>
                    Нет сущностей
                </div>
            ) : (
                <div className="entity-tab-list">
                    {domainEntities.map((e) => {
                        const key = (e.domainId + '/' + e.entityId).toLowerCase();
                        const hasParents = !!e.inherits;
                        const hasChildren = entityIndex && (entityIndex.children.get(key) || []).length > 0;
                        return (
                            <div
                                key={key}
                                className="entity-tab-item"
                                onClick={() => onOpenEntityHierarchy(key)}
                            >
                                <div className="entity-tab-item__head">
                                    <span className="entity-tab-item__id">{e.entityId}</span>
                                    {(hasParents || hasChildren) && (
                                        <span className="entity-tab-item__arrows">
                                            {(hasParents ? '↑' : '') + (hasChildren ? '↓' : '')}
                                        </span>
                                    )}
                                </div>
                                {e.name && e.name !== e.entityId && (
                                    <div className="entity-tab-item__name">{e.name}</div>
                                )}
                                {e.inherits && (
                                    <div className="entity-tab-item__inherits">↳ {e.inherits}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}