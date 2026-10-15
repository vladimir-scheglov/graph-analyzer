import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface SectionProps {
    id: string;
    title: string;
    icon: string;
    badge?: number | null;
    children: React.ReactNode;
}

export function Section({ id, title, icon, badge, children }: SectionProps) {
    const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
    const toggle = useGraphStore((s) => s.toggleCollapsedSection);

    return (
        <div className={'section' + (collapsed ? ' section--collapsed' : '')}>
            <button
                className="section__header"
                onClick={() => toggle(id, collapsed)}
            >
                <MIcon name={collapsed ? 'chevron_right' : 'expand_more'} size="sm" />
                <span className="section__icon">
                    <MIcon name={icon} size="sm" />
                </span>
                <span className="section__title">{title}</span>
                {badge != null && badge > 0 && <span className="section__badge">{badge}</span>}
            </button>
            {!collapsed && <div className="section__body">{children}</div>}
        </div>
    );
}