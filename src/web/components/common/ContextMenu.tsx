import React, { useEffect, useRef } from 'react';

export type ContextAction =
    | 'focus'
    | 'dependents'
    | 'path-from'
    | 'path-to'
    | 'open-file'
    | 'copy-id'
    | 'bookmark'
    | 'hide';

export interface ContextMenuState {
    x: number;
    y: number;
    nodeId: string;
}

export interface ContextMenuProps {
    menu: ContextMenuState | null;
    onClose: () => void;
    onAction: (action: ContextAction, nodeId: string) => void;
}

interface MenuItem {
    type?: 'divider';
    icon?: string;
    label?: string;
    action?: ContextAction;
    danger?: boolean;
}

const ITEMS: MenuItem[] = [
    { icon: '🎯', label: 'Фокус (N шагов)', action: 'focus' },
    { icon: '📊', label: 'Что зависит от него', action: 'dependents' },
    { icon: '🛤️', label: 'Путь от...', action: 'path-from' },
    { icon: '↪️', label: 'Путь до...', action: 'path-to' },
    { type: 'divider' },
    { icon: '📂', label: 'Открыть файл', action: 'open-file' },
    { icon: '📋', label: 'Копировать ID', action: 'copy-id' },
    { icon: '★', label: 'В закладки', action: 'bookmark' },
    { icon: '👁️', label: 'Скрыть', action: 'hide', danger: true }
];

export function ContextMenu({ menu, onClose, onAction }: ContextMenuProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menu) return;
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onEsc, true);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onEsc, true);
        };
    }, [menu, onClose]);

    if (!menu) return null;

    return (
        <div className="ctx-menu" ref={ref} style={{ left: menu.x, top: menu.y }}>
            {ITEMS.map((it, i) => {
                if (it.type === 'divider') return <div key={i} className="ctx-menu__divider" />;
                return (
                    <button
                        key={i}
                        className={'ctx-menu__item' + (it.danger ? ' ctx-menu__item--danger' : '')}
                        onClick={() => {
                            if (it.action) onAction(it.action, menu.nodeId);
                            onClose();
                        }}
                    >
                        <span className="ctx-menu__icon">{it.icon}</span>
                        <span>{it.label}</span>
                    </button>
                );
            })}
        </div>
    );
}