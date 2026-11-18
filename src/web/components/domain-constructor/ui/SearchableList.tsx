import { useDeferredValue, useMemo, useState, type FC, type ReactNode } from 'react';

export interface SearchableListItem {
    key: string;
    label: string;
    /** Дополнительный текст (например, ID). */
    hint?: string;
    /** Бейдж «унаследовано» / «миксин» / «unused». */
    badge?: ReactNode;
    /** read-only унаследованные элементы нельзя перетаскивать. */
    disabled?: boolean;
}

interface Props {
    items: SearchableListItem[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
    onCreate?: () => void;
    onDelete?: (key: string) => void;
    onReorder?: (fromKey: string, toKey: string) => void;
    title?: string;
    emptyText?: string;
    createLabel?: string;
}

export const SearchableList: FC<Props> = ({
    items, selectedKey, onSelect, onCreate, onDelete, onReorder,
    title, emptyText = 'Пусто', createLabel = 'Создать',
}) => {
    const [query, setQuery] = useState('');
    const deferredQuery = useDeferredValue(query);

    const filtered = useMemo(() => {
        const q = deferredQuery.trim().toLowerCase();
        if (!q) return items;
        return items.filter(
            (it) =>
                it.label.toLowerCase().includes(q) ||
                (it.hint?.toLowerCase().includes(q) ?? false),
        );
    }, [items, deferredQuery]);

    const dragState = { fromKey: null as string | null };

    return (
        <aside className="dc-list-panel">
            {title && <div className="dc-list-panel__title">{title}</div>}

            <div className="dc-list-panel__toolbar">
                <input
                    className="dc-input dc-input--search"
                    placeholder="Поиск…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {onCreate && (
                    <button className="dc-btn dc-btn--primary dc-btn--icon" onClick={onCreate} title={createLabel}>
                        +
                    </button>
                )}
            </div>

            <ul className="dc-list">
                {filtered.length === 0 && (
                    <li className="dc-list__empty">{emptyText}</li>
                )}
                {filtered.map((it) => (
                    <li
                        key={it.key}
                        className={
                            'dc-list__item' +
                            (selectedKey === it.key ? ' dc-list__item--selected' : '') +
                            (it.disabled ? ' dc-list__item--disabled' : '')
                        }
                        draggable={!!onReorder && !it.disabled}
                        onDragStart={(e) => {
                            if (!onReorder || it.disabled) return;
                            dragState.fromKey = it.key;
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                            if (!onReorder || !dragState.fromKey || dragState.fromKey === it.key) return;
                            e.preventDefault();
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (!onReorder || !dragState.fromKey) return;
                            onReorder(dragState.fromKey, it.key);
                            dragState.fromKey = null;
                        }}
                        onClick={() => onSelect(it.key)}
                    >
                        <div className="dc-list__main">
                            <span className="dc-list__label">{it.label}</span>
                            {it.hint && <span className="dc-list__hint">{it.hint}</span>}
                        </div>
                        {it.badge && <span className="dc-list__badge">{it.badge}</span>}
                        {onDelete && !it.disabled && (
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon dc-list__delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(it.key);
                                }}
                                title="Удалить"
                            >
                                ×
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </aside>
    );
};