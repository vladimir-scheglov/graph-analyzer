import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface CollapsibleSectionProps {
    id: string;
    title: string;
    count?: number;
    children: React.ReactNode;
}

export function CollapsibleSection({ id, title, count, children }: CollapsibleSectionProps) {
    const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
    const toggle = useGraphStore((s) => s.toggleCollapsedSection);
    const isOpen = !collapsed;

    return (
        <div className="details__field">
            <button
                className="details__field-label details__field-label--btn"
                onClick={() => toggle(id, !isOpen)}
            >
                <MIcon name={isOpen ? 'expand_more' : 'chevron_right'} size="sm" />
                <span style={{ marginLeft: 6 }}>{title}</span>
                {count != null && <span className="details__field-count">{count}</span>}
            </button>
            {isOpen && children}
        </div>
    );
}