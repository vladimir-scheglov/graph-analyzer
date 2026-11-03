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
    const layoutType = useGraphStore((s) => s.layoutType);
    const heatmap = useGraphStore((s) => s.heatmap);
    const compact = useGraphStore((s) => s.compact);
    const showGroups = useGraphStore((s) => s.showGroups);
    const bidirectional = useGraphStore((s) => s.bidirectional);
    const showEdgeLabels = useGraphStore((s) => s.showEdgeLabels);

    return (
        <div className="menu">
            <div className="menu__label">Раскладка</div>
            {LAYOUTS.map((l) => (
                <button
                    key={l.key}
                    className={'menu__item' + (layoutType === l.key ? ' menu__item--active' : '')}
                    onClick={() => useGraphStore.getState().setLayoutType(l.key)}
                >
                    <span className="menu__icon">{layoutType === l.key ? '●' : '○'}</span>
                    <span className="menu__text">{l.label}</span>
                </button>
            ))}

            <div className="menu__divider" />
            <div className="menu__label">Heatmap</div>
            {HEATMAPS.map((h) => (
                <button
                    key={h.key}
                    className={'menu__item' + (heatmap === h.key ? ' menu__item--active' : '')}
                    onClick={() => {
                        useGraphStore.getState().setHeatmap(h.key);
                        close();
                    }}
                >
                    <span className="menu__icon">{heatmap === h.key ? '●' : '○'}</span>
                    <span className="menu__text">{h.label}</span>
                </button>
            ))}

            <div className="menu__divider" />
            <div className="menu__label">Отображение</div>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={compact}
                    onChange={() => useGraphStore.getState().setCompact((v) => !v)}
                />
                <span className="menu__check" />
                <span className="menu__text">Компактный режим</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={showGroups}
                    onChange={() => useGraphStore.getState().setShowGroups(!showGroups)}
                />
                <span className="menu__check" />
                <span className="menu__text">Группировка в рамки</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={bidirectional}
                    onChange={() => useGraphStore.getState().setBidirectional(!bidirectional)}
                />
                <span className="menu__check" />
                <span className="menu__text">Объединять A↔B</span>
            </label>

            <label className="menu__checkbox">
                <input
                    type="checkbox"
                    checked={showEdgeLabels}
                    onChange={() => useGraphStore.getState().setShowEdgeLabels(!showEdgeLabels)}
                />
                <span className="menu__check" />
                <span className="menu__text">Подписи связей</span>
            </label>
        </div>
    );
}