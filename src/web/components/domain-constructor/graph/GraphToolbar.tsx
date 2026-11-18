import type { FC } from 'react';
import type { GraphLayer, GraphFilterOptions } from './types';

interface Props {
    filter: GraphFilterOptions;
    onFilterChange: (f: GraphFilterOptions) => void;
    onResetView: () => void;
}

const LAYERS: Array<{ key: GraphLayer; label: string }> = [
    { key: 'linkages', label: 'Связи' },
    { key: 'inheritance', label: 'Наследование' },
    { key: 'mixins', label: 'Примеси' },
    { key: 'transitive', label: 'Транзитивные' },
];

const LINKAGE_TYPES = [
    { value: '1_1', label: '1–1' },
    { value: '1_n', label: '1–N' },
    { value: 'n_n', label: 'N–N' },
];

export const GraphToolbar: FC<Props> = ({ filter, onFilterChange, onResetView }) => {
    const toggleLayer = (layer: GraphLayer) => {
        const next = new Set(filter.layers);
        if (next.has(layer)) next.delete(layer);
        else next.add(layer);
        onFilterChange({ ...filter, layers: next });
    };

    const toggleLinkageType = (type: string) => {
        const next = new Set(filter.linkageTypes);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        onFilterChange({ ...filter, linkageTypes: next });
    };

    return (
        <div className="dc-graph-toolbar">
            <div className="dc-graph-toolbar__section">
                <span className="dc-graph-toolbar__label">Слои:</span>
                {LAYERS.map((l) => (
                    <button
                        key={l.key}
                        type="button"
                        className={
                            'dc-graph-chip' +
                            (filter.layers.has(l.key) ? ' dc-graph-chip--active' : '')
                        }
                        onClick={() => toggleLayer(l.key)}
                    >
                        {l.label}
                    </button>
                ))}
            </div>

            {filter.layers.has('linkages') && (
                <div className="dc-graph-toolbar__section">
                    <span className="dc-graph-toolbar__label">Тип связи:</span>
                    {LINKAGE_TYPES.map((t) => (
                        <button
                            key={t.value}
                            type="button"
                            className={
                                'dc-graph-chip' +
                                (filter.linkageTypes.has(t.value) ? ' dc-graph-chip--active' : '')
                            }
                            onClick={() => toggleLinkageType(t.value)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="dc-graph-toolbar__spacer" />

            <div className="dc-graph-toolbar__section">
                <input
                    className="dc-input dc-input--compact"
                    placeholder="Поиск по имени или ID"
                    value={filter.search}
                    onChange={(e) => onFilterChange({ ...filter, search: e.target.value })}
                />
                <button type="button" className="dc-btn" onClick={onResetView}>
                    Центрировать
                </button>
            </div>
        </div>
    );
};