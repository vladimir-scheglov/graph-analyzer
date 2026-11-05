import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';

export interface SidebarSection {
    id: string;
    title: string;
    icon: string;
}

export interface SidebarMenuProps {
    sections: SidebarSection[];
    onCollapseAll: () => void;
    onExpandAll: () => void;
    onExportStats: () => void;
    onClose: () => void;
}

export function SidebarMenu({
    sections,
    onCollapseAll,
    onExpandAll,
    onExportStats,
    onClose,
}: SidebarMenuProps) {
    const hidden = useGraphStore((s) => s.hiddenSidebarSections);
    const toggleHidden = useGraphStore((s) => s.toggleHiddenSidebarSection);

    return (
        <div className="menu" style={{ padding: 6 }}>
            <div className="menu__label">Секции</div>
            <button
                className="menu__item"
                onClick={() => {
                    onCollapseAll();
                    onClose();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="unfold_less" size="sm" />
                </span>
                <span className="menu__text">Свернуть все</span>
            </button>
            <button
                className="menu__item"
                onClick={() => {
                    onExpandAll();
                    onClose();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="unfold_more" size="sm" />
                </span>
                <span className="menu__text">Развернуть все</span>
            </button>

            <div className="menu__divider" />
            <div className="menu__label">Показывать секции</div>
            {sections.map((s) => {
                const isHidden = hidden.has(s.id);
                return (
                    <label key={s.id} className="menu__checkbox">
                        <input
                            type="checkbox"
                            checked={!isHidden}
                            onChange={() => toggleHidden(s.id)}
                        />
                        <span className="menu__check" />
                        <MIcon name={s.icon} size="sm" className="menu__icon" />
                        <span className="menu__text">{s.title}</span>
                    </label>
                );
            })}

            <div className="menu__divider" />
            <button
                className="menu__item"
                onClick={() => {
                    onExportStats();
                    onClose();
                }}
            >
                <span className="menu__icon">
                    <MIcon name="download" size="sm" />
                </span>
                <span className="menu__text">Экспорт статистики (MD)</span>
            </button>
        </div>
    );
}