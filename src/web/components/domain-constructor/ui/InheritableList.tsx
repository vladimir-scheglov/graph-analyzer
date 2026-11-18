import type { FC, ReactNode } from 'react';

export type InheritMode = 'append' | 'override' | 'except';

interface Props {
    label: string;
    /** Унаследован ли список от родителя (если нет — mode не показываем). */
    hasParent: boolean;
    mode: InheritMode;
    onModeChange: (m: InheritMode) => void;
    /** «Исключённые» id (только для mode='except'). */
    exceptIds?: string[];
    onExceptChange?: (ids: string[]) => void;
    /** Унаследованные элементы (для отображения read-only). */
    inheritedItems?: Array<{ id: string; label: string }>;
    children: ReactNode;
}

/**
 * Обёртка для списочных полей с наследованием (menu, tabs, actionPanel,
 * components, columns, sortingBy.columns).
 *
 *  - mode='append'    → наследуются все + добавляются свои;
 *  - mode='override'  → родительские отменяются, только свои;
 *  - mode='except'    → наследуются все, кроме exceptIds.
 */
export const InheritableList: FC<Props> = ({
    label, hasParent, mode, onModeChange, exceptIds = [], onExceptChange,
    inheritedItems = [], children,
}) => (
    <div className="dc-inherit-list">
        <div className="dc-inherit-list__header">
            <span className="dc-inherit-list__label">{label}</span>
            {hasParent && (
                <select
                    className="dc-input dc-input--inline"
                    value={mode}
                    onChange={(e) => onModeChange(e.target.value as InheritMode)}
                >
                    <option value="append">Дополнять</option>
                    <option value="override">Переопределить</option>
                    <option value="except">Кроме перечисленных</option>
                </select>
            )}
        </div>

        {hasParent && mode !== 'override' && inheritedItems.length > 0 && (
            <div className="dc-inherit-list__inherited">
                <div className="dc-inherit-list__inherited-title">Унаследовано:</div>
                <ul>
                    {inheritedItems.map((it) => {
                        const excluded = mode === 'except' && exceptIds.includes(it.id);
                        return (
                            <li key={it.id} className="dc-inherit-list__inherited-item">
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={!excluded}
                                    onChange={(e) => {
                                        if (!onExceptChange) return;
                                        const next = e.target.checked
                                            ? exceptIds.filter((id) => id !== it.id)
                                            : [...exceptIds, it.id];
                                        onExceptChange(next);
                                    }}
                                />
                                <span className={excluded ? 'dc-muted dc-strike' : ''}>{it.label}</span>
                            </li>
                        );
                    })}
                </ul>
            </div>
        )}

        <div className="dc-inherit-list__own">
            {mode !== 'override' && (
                <div className="dc-inherit-list__own-title">Собственные:</div>
            )}
            {children}
        </div>
    </div>
);