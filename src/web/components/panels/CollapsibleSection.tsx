import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface CollapsibleSectionProps {
    id: string;
    title: string;
    icon?: string;
    count?: number;
    /** Визуальный вариант бейджа-счётчика. */
    badgeVariant?: 'default' | 'danger' | 'warning' | 'success';
    /** Контент справа от заголовка (например, маленькая кнопка-действие). */
    right?: React.ReactNode;
    children: React.ReactNode;
}

export function CollapsibleSection({
    id,
    title,
    icon,
    count,
    badgeVariant = 'default',
    right,
    children,
}: CollapsibleSectionProps) {
    const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
    const toggle = useGraphStore((s) => s.toggleCollapsedSection);
    const isOpen = !collapsed;

    return (
        <div className="details__field">
            <div className="details__field-head">
                <button
                    className="details__field-label details__field-label--btn"
                    onClick={() => toggle(id, !isOpen)}
                >
                    <MIcon name={isOpen ? 'expand_more' : 'chevron_right'} size="sm" />
                    {icon && (
                        <span className="details__field-icon">
                            <MIcon name={icon} size="sm" />
                        </span>
                    )}
                    <span>{title}</span>
                    {count != null && (
                        <span
                            className={
                                'details__field-count details__field-count--' +
                                badgeVariant
                            }
                        >
                            {count}
                        </span>
                    )}
                </button>
                {right && <div className="details__field-right">{right}</div>}
            </div>
            {isOpen && <div className="details__field-body">{children}</div>}
        </div>
    );
}