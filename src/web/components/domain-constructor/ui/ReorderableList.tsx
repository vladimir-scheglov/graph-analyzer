import { useState, type FC, type ReactNode } from 'react';

interface Props<T extends { id: string }> {
    items: T[];
    renderItem: (item: T, index: number) => ReactNode;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onDelete?: (id: string) => void;
    onAdd?: () => void;
    addLabel?: string;
    emptyText?: string;
}

/**
 * Простой reorderable-список на нативном HTML5 DnD, без библиотек.
 * Кнопка «Добавить» — внизу.
 */
export function ReorderableList<T extends { id: string }>({
    items, renderItem, onReorder, onDelete, onAdd, addLabel = 'Добавить', emptyText = 'Пусто',
}: Props<T>) {
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

    return (
        <div className="dc-reorder">
            {items.length === 0 && <div className="dc-reorder__empty">{emptyText}</div>}

            {items.map((item, i) => (
                <div
                    key={item.id}
                    className={
                        'dc-reorder__row' +
                        (draggingIndex === i ? ' dc-reorder__row--dragging' : '')
                    }
                    draggable
                    onDragStart={() => setDraggingIndex(i)}
                    onDragEnd={() => setDraggingIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        if (draggingIndex === null || draggingIndex === i) return;
                        onReorder(draggingIndex, i);
                        setDraggingIndex(null);
                    }}
                >
                    <span className="dc-reorder__handle" title="Перетащить">⋮⋮</span>
                    <div className="dc-reorder__content">{renderItem(item, i)}</div>
                    {onDelete && (
                        <button
                            type="button"
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => onDelete(item.id)}
                            title="Удалить"
                        >×</button>
                    )}
                </div>
            ))}

            {onAdd && (
                <button type="button" className="dc-btn dc-btn--dashed" onClick={onAdd}>
                    + {addLabel}
                </button>
            )}
        </div>
    );
}