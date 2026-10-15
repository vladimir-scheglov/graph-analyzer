import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';

export function TagsSection({ items }: { items: Array<[string, number]> }) {
    const store = useGraphStore();
    if (items.length === 0) return null;

    return (
        <Section
            id="tags"
            title="Теги"
            icon="label"
            badge={store.tagFilters.size > 0 ? store.tagFilters.size : null}
        >
            <div className="tag-cloud">
                {items.map((entry) => {
                    const [tag, count] = entry;
                    const active = store.tagFilters.has(tag);
                    return (
                        <button
                            key={tag}
                            className={'tag' + (active ? ' tag--active' : '')}
                            onClick={() => store.toggleTagFilter(tag)}
                        >
                            {tag}
                            <span className="tag__count">{count}</span>
                        </button>
                    );
                })}
            </div>
        </Section>
    );
}