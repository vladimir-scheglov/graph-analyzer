import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';

export function TagsSection({ items }: { items: Array<[string, number]> }) {
    const store = useGraphStore();
    if (items.length === 0) return null;

    const badge =
        store.viewMode === "list"
            ? store.listSearchQuery && items.some(([t]) => t === store.listSearchQuery)
                ? 1
                : null
            : store.tagFilters.size > 0
                ? store.tagFilters.size
                : null;

    return (
        <Section id="tags" title="Теги" icon="label" badge={badge}>
            <div className="tag-cloud">
                {items.map((entry) => {
                    const [tag, count] = entry;
                    const active =
                        store.viewMode === "list"
                            ? store.listSearchQuery === tag
                            : store.tagFilters.has(tag);
                    return (
                        <button
                            key={tag}
                            className={'tag' + (active ? ' tag--active' : '')}
                            onClick={() => {
                                if (store.viewMode === "list") {
                                    store.setListSearchQuery(active ? "" : tag);
                                } else {
                                    store.toggleTagFilter(tag);
                                }
                            }}
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