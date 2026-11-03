import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';

export function TagsSection({ items }: { items: Array<[string, number]> }) {
    const viewMode = useGraphStore((s) => s.viewMode);
    const listSearchQuery = useGraphStore((s) => s.listSearchQuery);
    const tagFilters = useGraphStore((s) => s.tagFilters);

    if (items.length === 0) return null;

    const badge =
        viewMode === "list"
            ? listSearchQuery && items.some(([t]) => t === listSearchQuery)
                ? 1
                : null
            : tagFilters.size > 0
                ? tagFilters.size
                : null;

    return (
        <Section id="tags" title="Теги" icon="label" badge={badge}>
            <div className="tag-cloud">
                {items.map((entry) => {
                    const [tag, count] = entry;
                    const active =
                        viewMode === "list"
                            ? listSearchQuery === tag
                            : tagFilters.has(tag);
                    return (
                        <button
                            key={tag}
                            className={'tag' + (active ? ' tag--active' : '')}
                            onClick={() => {
                                const st = useGraphStore.getState();
                                if (viewMode === "list") {
                                    st.setListSearchQuery(active ? "" : tag);
                                } else {
                                    st.toggleTagFilter(tag);
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