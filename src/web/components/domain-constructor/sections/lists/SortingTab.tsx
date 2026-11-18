import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ViewSchema } from '../../types';
import {
    addSortingColumn, removeSortingColumn, updateSortingColumn, updateDefaultSorting,
} from './lists-handlers';

interface Props { view: ViewSchema }

export const ListSortingTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);

    const sortingBy = ((view as any).table?.sortingBy ?? {}) as any;
    const columns = sortingBy.columns ?? [];
    const defaults = sortingBy.defaults ?? {};
    const tableColumns = ((view as any).table?.columns ?? []) as any[];

    return (
        <div>
            <h4 className="dc-constraints__title">Правила сортировки</h4>

            <div className="dc-constraints__header">
                <span className="dc-muted">Колонка → правило сортировки</span>
                <button
                    className="dc-btn dc-btn--dashed"
                    onClick={() => commit((doc) => addSortingColumn(doc, view.id))}
                >+ правило</button>
            </div>

            {columns.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет правил</div>
            )}

            {columns.map((c: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeSortingColumn(doc, view.id, i))}
                        >×</button>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Колонка</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={c.column ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateSortingColumn(doc, view.id, i, 'column', e.target.value))
                                }
                            >
                                <option value="">—</option>
                                {tableColumns.map((col: any) => (
                                    <option key={col.id} value={col.id}>{col.id}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Правило</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={c.sorting ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateSortingColumn(doc, view.id, i, 'sorting', e.target.value))
                                }
                            />
                        </div>
                    </div>
                </div>
            ))}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Сортировка по умолчанию</h4>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Колонка</label>
                    <select
                        className="dc-input"
                        value={defaults.column ?? ''}
                        onChange={(e) =>
                            commit((doc) =>
                                updateDefaultSorting(doc, view.id, e.target.value || undefined, defaults.direction),
                            )
                        }
                    >
                        <option value="">—</option>
                        {tableColumns.map((col: any) => (
                            <option key={col.id} value={col.id}>{col.id}</option>
                        ))}
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Направление</label>
                    <select
                        className="dc-input"
                        value={defaults.direction ?? 'asc'}
                        onChange={(e) =>
                            commit((doc) =>
                                updateDefaultSorting(doc, view.id, defaults.column, e.target.value as any),
                            )
                        }
                        disabled={!defaults.column}
                    >
                        <option value="asc">По возрастанию</option>
                        <option value="desc">По убыванию</option>
                    </select>
                </div>
            </div>
        </div>
    );
};