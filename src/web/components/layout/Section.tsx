import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface SectionProps {
    id: string;
    title: string;
    icon: string;
    badge?: number | null;
    badgeVariant?: 'default' | 'danger' | 'warning' | 'success';
    /** Дополнительные элементы справа от заголовка (табы, кнопки). */
    right?: React.ReactNode;
    children: React.ReactNode;
}

export function Section({
    id,
    title,
    icon,
    badge,
    badgeVariant = 'default',
    right,
    children,
}: SectionProps) {
    const collapsed = useGraphStore((s) => s.collapsedSections.has(id));
    const toggle = useGraphStore((s) => s.toggleCollapsedSection);

    return (
        <div className={'section' + (collapsed ? ' section--collapsed' : '')}>
            <div className="section__header-row">
                <button
                    className="section__header"
                    onClick={() => toggle(id, collapsed)}
                >
                    <MIcon
                        name={collapsed ? 'chevron_right' : 'expand_more'}
                        size="sm"
                    />
                    <span className="section__icon">
                        <MIcon name={icon} size="sm" />
                    </span>
                    <span className="section__title">{title}</span>
                    {badge != null && badge > 0 && (
                        <span
                            className={
                                'section__badge section__badge--' + badgeVariant
                            }
                        >
                            {badge}
                        </span>
                    )}
                </button>
                {right && <div className="section__right">{right}</div>}
            </div>
            {!collapsed && <div className="section__body">{children}</div>}
        </div>
    );
}

// ============ Tabs ============

export interface SectionTabOption<T extends string> {
    value: T;
    label: string;
    icon?: string;
}

export function SectionTabs<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (v: T) => void;
    options: SectionTabOption<T>[];
}) {
    return (
        <div className="section-tabs">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={
                        'section-tab' + (opt.value === value ? ' active' : '')
                    }
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange(opt.value);
                    }}
                    title={opt.label}
                >
                    {opt.icon && <MIcon name={opt.icon} size="sm" />}
                    <span>{opt.label}</span>
                </button>
            ))}
        </div>
    );
}