import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import type { LayoutType } from '../../lib/layout';
import type { HeatmapKey } from '../../state/useGraphStore';

export interface ViewMenuProps {
    close: () => void;
}

const LAYOUTS: Array<{ key: LayoutType; label: string }> = [
    { key: 'LR', label: 'Горизонтальная (LR)' },
    { key: 'TB', label: 'Вертикальная (TB)' },
    { key: 'force', label: 'Force-directed' },
    { key: 'circular', label: 'Круговой' },
    { key: 'cluster', label: 'По семействам' },
    { key: 'folder', label: 'По каталогам' }
];

const HEATMAPS: Array<{ key: HeatmapKey; label: string }> = [
    { key: 'none', label: 'Выключен' },
    { key: 'health', label: 'Health score' },
    { key: 'degree', label: 'Количество связей' },
    { key: 'entities', label: 'Entities' },
    { key: 'fqid', label: 'Исходящие FQID' }
];

export function ViewMenu({ close }: ViewMenuProps) {
    const store = useGraphStore();

    return (
        <div className="menu">
            <div className="menu__label">Раскладка</div>
            {LAYOUTS.map((l) => (
                <button
                    key={l.key}
                    className={'menu__item' + (store.layoutType === l.key ? ' menu__item--active' : '')}
                    onClick={() => store.setLayoutType(l.key)}
                >
                    <span className="menu__icon">{store.layoutType === l.key ? '●' : '○'}</span>
                    <span className="menu__text">{l.label}</span>
                </button>
            ))}

            <div className="menu__divider" />
            <div className="menu__label">Heatmap</div>
            {HEATMAPS.map((h) => (
                <button
                    key={h.key}
                    className={'menu__item' + (store.heatmap === h.key ? ' menu__item--active' : '')}
                    onClick={() => {
                        store.setHeatmap(h.key);
                        close();
                    }}
                >
                    <span className="menu__icon">{store.heatmap === h.key ? '●' : '○'}</span>
                    <span className="menu__text">{h.label}</span>
                </button>
            ))}

            <div className="menu__divider" />
            <div className="menu__label">Отображение</div>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={store.compact}
                    onChange={() => store.setCompact((v) => !v)}
                />
                <span className="menu__check" />
                <span className="menu__text">Компактный режим</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={store.showGroups}
                    onChange={() => store.setShowGroups(!store.showGroups)}
                />
                <span className="menu__check" />
                <span className="menu__text">Группировка в рамки</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={store.bidirectional}
                    onChange={() => store.setBidirectional(!store.bidirectional)}
                />
                <span className="menu__check" />
                <span className="menu__text">Объединять A↔B</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={store.showEdgeLabels}
                    onChange={() => store.setShowEdgeLabels(!store.showEdgeLabels)}
                />
                <span className="menu__check" />
                <span className="menu__text">Подписи связей</span>
            </label>

            <div className="menu__divider" />

            <button
                className="menu__item"
                onClick={() => {
                    store.setTheme(store.theme === 'dark' ? 'light' : 'dark');
                    close();
                }}
            >
                <span className="menu__icon">{store.theme === 'dark' ? '☀️' : '🌙'}</span>
                <span className="menu__text">
                    {store.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                </span>
            </button>
        </div>
    );
}