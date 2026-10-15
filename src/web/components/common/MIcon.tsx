import React from 'react';

export type MIconSize = 'sm' | 'md' | 'lg' | 'xl';

export interface MIconProps {
    name: string;
    size?: MIconSize;
    fill?: boolean;
    className?: string;
    title?: string;
    style?: React.CSSProperties;
}

export function MIcon({ name, size = 'md', fill, className, title, style }: MIconProps) {
    const cls = ['material-symbols-outlined'];
    cls.push(size === 'sm' ? 'mi-sm' : size === 'lg' ? 'mi-lg' : size === 'xl' ? 'mi-xl' : 'mi-md');
    if (fill) cls.push('mi-fill');
    if (className) cls.push(className);

    return (
        <span className={cls.join(' ')} aria-hidden="true" title={title} style={style}>
            {name}
        </span>
    );
}