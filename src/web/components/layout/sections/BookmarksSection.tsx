import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

export function BookmarksSection() {
    const store = useGraphStore();
    const { goto } = useNavigation();
    if (store.bookmarks.size === 0) return null;

    return (
        <Section id="bookmarks" title="Избранное" icon="star" badge={store.bookmarks.size}>
            <div className="rank-list">
                {Array.from(store.bookmarks)
                    .slice(0, store.sidebarCompact ? 5 : 15)
                    .map((id) => {
                        const n = store.nodes.find((x) => x.id === id);
                        if (!n) return null;
                        return (
                            <div
                                key={id}
                                className="rank-item"
                                style={{ cursor: 'pointer' }}
                                onClick={() => goto(n.data.domainId)}
                            >
                                <span className="rank-item__num">
                                    <MIcon name="star" size="sm" fill />
                                </span>
                                <span className="rank-item__label">{n.data.domainId}</span>
                                <button
                                    className="rank-item__remove"
                                    onClick={(ev) => {
                                        ev.stopPropagation();
                                        store.toggleBookmark(id);
                                    }}
                                    title="Убрать из избранного"
                                >
                                    <MIcon name="close" size="sm" />
                                </button>
                            </div>
                        );
                    })}
            </div>
        </Section>
    );
}