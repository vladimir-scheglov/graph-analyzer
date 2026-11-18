import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import type { ViewSchema } from '../../types';
import {
    updateViewField, updateSourceField, addSourceJoin, removeSourceJoin, updateSourceJoinField,
    addTableColumn, removeTableColumn, updatePaging, setSelection, setRowClickAction,
} from '../views/views-handlers';
import { TableColumnRow } from '../views/TableColumnRow';
import { ActionSelect } from '../../ui/ActionSelect';
import { LinkageSelect } from '../../ui/LinkageSelect';
import { FilterTab } from '../lists/FilterTab';
import { ListSortingTab } from '../lists/SortingTab';
import { RefreshTab } from '../lists/RefreshTab';

interface Props { view: ViewSchema }

type Tab = 'main' | 'columns' | 'filter' | 'sorting' | 'refresh' | 'paging';

export const ListForm: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const [tab, setTab] = useState<Tab>('main');

    const v = view as any;
    const source = v.source ?? {};
    const table = v.table ?? {};
    const columns = table.columns ?? [];
    const joins = source.joins ?? [];
    const actions = table.actions ?? [];
    const paging = table.paging ?? {};

    const rowClick = actions.find((a: any) => a?.type === 'row_click')?.action;
    const rowDblClick = actions.find((a: any) => a?.type === 'row_double_click')?.action;

    const set = (field: string, value: unknown) =>
        commit((doc) => updateViewField(doc, view.id, field, value));

    return (
        <div>
            <div className="dc-detail__tabs" role="tablist">
                {[
                    { key: 'main', label: 'Основное' },
                    { key: 'columns', label: `Столбцы (${columns.length})` },
                    { key: 'filter', label: 'Фильтрация' },
                    { key: 'sorting', label: 'Сортировка' },
                    { key: 'refresh', label: 'Обновление' },
                    { key: 'paging', label: 'Пагинация' },
                ].map((t) => (
                    <button
                        key={t.key}
                        role="tab"
                        aria-selected={tab === t.key}
                        className={'dc-detail__tab' + (tab === t.key ? ' dc-detail__tab--active' : '')}
                        onClick={() => setTab(t.key as Tab)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ paddingTop: 16 }}>
                {tab === 'main' && (
                    <>
                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">ID</label>
                                <input className="dc-input" value={view.id} disabled />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">Лейбл</label>
                                <input
                                    className="dc-input"
                                    value={view.label ?? ''}
                                    onChange={(e) => set('label', e.target.value || undefined)}
                                />
                            </div>
                        </div>

                        <div className="dc-field">
                            <label className="dc-field__label">Наследовать из</label>
                            <input
                                className="dc-input"
                                value={view.inherits ?? ''}
                                onChange={(e) => set('inherits', e.target.value || undefined)}
                            />
                        </div>

                        <div className="dc-field">
                            <label className="dc-field__label">Сущность (source.entity)</label>
                            <EntitySelect
                                value={source.entity ?? null}
                                onChange={(v) => commit((doc) => updateSourceField(doc, view.id, 'entity', v ?? ''))}
                            />
                        </div>

                        <div className="dc-constraints__header">
                            <label className="dc-field__label">Связанные сущности (joins)</label>
                            <button
                                className="dc-btn dc-btn--dashed"
                                onClick={() => commit((doc) => addSourceJoin(doc, view.id))}
                            >+ связь</button>
                        </div>

                        {joins.map((j: any, i: number) => (
                            <div key={i} className="dc-constraint">
                                <div className="dc-constraint__header">
                                    <span className="dc-constraint__kind">join #{i + 1}</span>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => commit((doc) => removeSourceJoin(doc, view.id, i))}
                                    >×</button>
                                </div>
                                <div className="dc-field-row">
                                    <div className="dc-field">
                                        <label className="dc-field__label">ID</label>
                                        <input
                                            className="dc-input"
                                            value={j.id ?? ''}
                                            onChange={(e) =>
                                                commit((doc) => updateSourceJoinField(doc, view.id, i, 'id', e.target.value))
                                            }
                                        />
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">Связь</label>
                                        <LinkageSelect
                                            value={j.linkage ?? null}
                                            onChange={(v) =>
                                                commit((doc) => updateSourceJoinField(doc, view.id, i, 'linkage', v ?? ''))
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="dc-field">
                            <label className="dc-field__label">
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={!!table.selection}
                                    onChange={(e) => commit((doc) => setSelection(doc, view.id, e.target.checked))}
                                />{' '}
                                Множественный выбор
                            </label>
                        </div>

                        <div className="dc-field">
                            <label className="dc-field__label">Одиночный клик</label>
                            <ActionSelect
                                value={rowClick ?? null}
                                onChange={(v) =>
                                    commit((doc) => setRowClickAction(doc, view.id, 'row_click', v ?? undefined))
                                }
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Двойной клик</label>
                            <ActionSelect
                                value={rowDblClick ?? null}
                                onChange={(v) =>
                                    commit((doc) => setRowClickAction(doc, view.id, 'row_double_click', v ?? undefined))
                                }
                            />
                        </div>
                    </>
                )}

                {tab === 'columns' && (
                    <>
                        <div className="dc-constraints__header">
                            <span className="dc-muted">Колонки таблицы ({columns.length})</span>
                            <button
                                className="dc-btn dc-btn--primary"
                                onClick={() => commit((doc) => addTableColumn(doc, view.id))}
                            >+ Столбец</button>
                        </div>
                        {columns.map((c: any, i: number) => (
                            <TableColumnRow
                                key={i}
                                viewId={view.id}
                                column={c}
                                index={i}
                                onRemove={() => commit((doc) => removeTableColumn(doc, view.id, i))}
                            />
                        ))}
                    </>
                )}

                {tab === 'filter' && <FilterTab view={view} />}
                {tab === 'sorting' && <ListSortingTab view={view} />}
                {tab === 'refresh' && <RefreshTab view={view} />}

                {tab === 'paging' && (
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Размеры (через запятую)</label>
                            <input
                                className="dc-input"
                                value={(paging.sizes ?? []).join(', ')}
                                onChange={(e) => {
                                    const sizes = e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                                    commit((doc) => updatePaging(doc, view.id, sizes, paging.defaultSize));
                                }}
                                placeholder="10, 50, 100"
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">По умолчанию</label>
                            <input
                                className="dc-input"
                                type="number"
                                value={paging.defaultSize ?? ''}
                                onChange={(e) => {
                                    const v = e.target.value === '' ? undefined : Number(e.target.value);
                                    commit((doc) => updatePaging(doc, view.id, paging.sizes, v));
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};