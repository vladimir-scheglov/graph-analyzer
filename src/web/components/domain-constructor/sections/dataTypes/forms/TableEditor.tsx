import { Fragment, useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import type { DataTypeSchema } from '../../../types';
import {
    addTableAttribute, removeTableAttribute, updateTableAttributeField,
    addTableColumn, removeTableColumn, updateTableColumnField,
    updateDataTypeField, syncColumnsFromAttributes,
    addTableSorting, removeTableSorting, updateTableSortingField,
    addTableSortingBy, removeTableSortingBy, updateTableSortingByField,
    addSortingByColumn, removeSortingByColumn, updateSortingByColumn, updateSortingByDefault,
    updatePaging, validateTableAttributeId,
} from '../dataType-handlers';
import { toast } from '../../../ui/toast';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { ConstraintsInline } from '../shared/ConstraintsInline';
import { PreviewPanel } from '../shared/PreviewPanel';

type Tab = 'columns' | 'view' | 'sorting' | 'paging' | 'settings';

const COLUMN_TYPES = [
    'String', 'Text', 'Integer', 'Decimal', 'Float', 'Bool',
    'Timestamp', 'Date', 'Time', 'TimestampRange',
    'MAC', 'IpAddress', 'CIDR', 'Uuid', 'URL',
    'Attachment', 'Reference', 'Enum', 'Workflow',
];

export const TableEditor: FC<{ dataType: DataTypeSchema }> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const [tab, setTab] = useState<Tab>('columns');
    const [pendingAttrDelete, setPendingAttrDelete] = useState<number | null>(null);
    const [pendingColDelete, setPendingColDelete] = useState<number | null>(null);
    const [expandedAttrs, setExpandedAttrs] = useState<Set<number>>(new Set());
    const [expandedSortings, setExpandedSortings] = useState<Set<number>>(new Set());

    const attributes = dataType.attributes ?? [];
    const view = ((dataType as any).view ?? {}) as any;
    const columns = view.columns ?? [];
    const sortings = ((dataType as any).sorting ?? []) as any[];
    const sortingBy = view.sortingBy ?? {};
    const sortingByCols = (sortingBy.columns ?? []) as any[];
    const sortingByDefault = sortingBy.default;
    const paging = view.paging ?? {};

    const attrsWithoutCols = attributes.filter(
        (a) => !columns.some((c: any) => c.attribute === a.id),
    );

    const toggleAttr = (i: number) => {
        setExpandedAttrs((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    };
    const toggleSorting = (i: number) => {
        setExpandedSortings((prev) => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    };

    return (
        <div className="dc-dt-editor">
            <div className="dc-dt-topbar">
                <div className="dc-dt-tabs" role="tablist">
                    {[
                        { key: 'columns', label: `Колонки (${attributes.length})` },
                        { key: 'view', label: `Представление (${columns.length})` },
                        { key: 'sorting', label: `Сортировка (${sortings.length})` },
                        { key: 'paging', label: 'Пагинация' },
                        { key: 'settings', label: 'Настройки' },
                    ].map((t) => (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={tab === t.key}
                            className={'dc-dt-tab' + (tab === t.key ? ' dc-dt-tab--active' : '')}
                            onClick={() => setTab(t.key as Tab)}
                        >{t.label}</button>
                    ))}
                </div>
            </div>

            {tab === 'columns' && (
                <div className="dc-dt-section">
                    <div className="dc-dt-toolbar">
                        <button
                            className="dc-btn dc-btn--primary"
                            onClick={() => commit((d) => addTableAttribute(d, dataType.id))}
                        >+ Колонка</button>
                    </div>

                    {attributes.length === 0 ? (
                        <div className="dc-dt-empty">
                            <p>Колонок пока нет</p>
                            <button
                                className="dc-btn dc-btn--primary"
                                onClick={() => commit((d) => addTableAttribute(d, dataType.id))}
                            >+ Создать первую колонку</button>
                        </div>
                    ) : (
                        <table className="dc-table dc-dt-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 160 }}>ID</th>
                                    <th>Название</th>
                                    <th style={{ width: 150 }}>Тип</th>
                                    <th style={{ width: 200 }}>Ограничения</th>
                                    <th style={{ width: 70 }}>Read-only</th>
                                    <th style={{ width: 50 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {attributes.map((a: any, i: number) => {
                                    const constraints = (a.constraints ?? []) as any[];
                                    const isExpanded = expandedAttrs.has(i);
                                    const idError = a.id ? validateTableAttributeId(a.id) : null;
                                    return (
                                        <Fragment key={i}>
                                            <tr className={isExpanded ? 'dc-dt-table__row--expanded' : ''}>
                                                <td>
                                                    <input
                                                        className={'dc-input dc-input--compact dc-input--mono' + (idError ? ' dc-input--error' : '')}
                                                        value={a.id ?? ''}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableAttributeField(d, dataType.id, i, 'id', e.target.value))
                                                        }
                                                        title={idError ?? ''}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className="dc-input dc-input--compact"
                                                        value={a.name ?? ''}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableAttributeField(d, dataType.id, i, 'name', e.target.value))
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="dc-input dc-input--compact"
                                                        value={a.dataType}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableAttributeField(d, dataType.id, i, 'dataType', e.target.value))
                                                        }
                                                    >
                                                        {COLUMN_TYPES.map((t) => (
                                                            <option key={t} value={t}>{t}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    {constraints.length === 0 ? (
                                                        <button
                                                            type="button"
                                                            className="dc-btn dc-btn--dashed dc-btn--icon"
                                                            onClick={() => toggleAttr(i)}
                                                            title="Добавить ограничения"
                                                        >⚙</button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className={'dc-dt-constraints-summary' + (isExpanded ? ' dc-dt-constraints-summary--open' : '')}
                                                            onClick={() => toggleAttr(i)}
                                                        >
                                                            <span className="dc-dt-constraints-summary__count">{constraints.length}</span>
                                                            <span className="dc-dt-constraints-summary__kinds">
                                                                {constraints.map((c) => c.kind).join(', ')}
                                                            </span>
                                                            <span className="dc-dt-constraints-summary__chevron">{isExpanded ? '▴' : '▾'}</span>
                                                        </button>
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        className="dc-checkbox"
                                                        checked={!!a.readonly}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableAttributeField(d, dataType.id, i, 'readonly', e.target.checked))
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                                        onClick={() => setPendingAttrDelete(i)}
                                                        disabled={isPublished}
                                                    >×</button>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr className="dc-dt-table__constraints-row">
                                                    <td colSpan={6}>
                                                        <ConstraintsInline
                                                            dataTypeId={dataType.id}
                                                            attrIndex={i}
                                                            attrDataType={a.dataType}
                                                            constraints={constraints}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === 'view' && (
                <div className="dc-dt-section">
                    <div className="dc-dt-toolbar">
                        {attrsWithoutCols.length > 0 && (
                            <button
                                className="dc-btn dc-btn--dashed"
                                onClick={() => {
                                    let n = 0;
                                    commit((d) => { n = syncColumnsFromAttributes(d, dataType.id); });
                                    toast.success(`Добавлено столбцов: ${n}`);
                                }}
                            >Синхронизировать ({attrsWithoutCols.length})</button>
                        )}
                        <div className="dc-dt-topbar__spacer" />
                        <button
                            className="dc-btn dc-btn--primary"
                            onClick={() => commit((d) => addTableColumn(d, dataType.id))}
                        >+ Столбец</button>
                    </div>

                    {columns.length === 0 ? (
                        <div className="dc-dt-empty">
                            <p>Столбцов представления нет</p>
                            {attrsWithoutCols.length > 0 && (
                                <button
                                    className="dc-btn dc-btn--primary"
                                    onClick={() => {
                                        let n = 0;
                                        commit((d) => { n = syncColumnsFromAttributes(d, dataType.id); });
                                        toast.success(`Добавлено столбцов: ${n}`);
                                    }}
                                >+ Сгенерировать из колонок ({attrsWithoutCols.length})</button>
                            )}
                        </div>
                    ) : (
                        <table className="dc-table dc-dt-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 140 }}>ID</th>
                                    <th style={{ width: 200 }}>Атрибут</th>
                                    <th>Лейбл</th>
                                    <th style={{ width: 50 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {columns.map((c: any, i: number) => (
                                    <tr key={i}>
                                        <td>
                                            <input
                                                className="dc-input dc-input--compact dc-input--mono"
                                                value={c.id ?? ''}
                                                onChange={(e) =>
                                                    commit((d) => updateTableColumnField(d, dataType.id, i, 'id', e.target.value))
                                                }
                                            />
                                        </td>
                                        <td>
                                            <select
                                                className="dc-input dc-input--compact"
                                                value={c.attribute ?? ''}
                                                onChange={(e) =>
                                                    commit((d) => updateTableColumnField(d, dataType.id, i, 'attribute', e.target.value))
                                                }
                                            >
                                                <option value="">—</option>
                                                {attributes.map((a: any) => (
                                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <input
                                                className="dc-input dc-input--compact"
                                                value={c.label ?? ''}
                                                onChange={(e) =>
                                                    commit((d) => updateTableColumnField(d, dataType.id, i, 'label', e.target.value))
                                                }
                                            />
                                        </td>
                                        <td>
                                            <button
                                                className="dc-btn dc-btn--danger dc-btn--icon"
                                                onClick={() => setPendingColDelete(i)}
                                                disabled={isPublished}
                                            >×</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tab === 'sorting' && (
                <div className="dc-dt-section">
                    <h4 className="dc-dt-section__title">Правила сортировки</h4>
                    <div className="dc-dt-toolbar">
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => commit((d) => addTableSorting(d, dataType.id))}
                        >+ Правило</button>
                    </div>

                    {sortings.length === 0 && (
                        <div className="dc-muted dc-constraints__empty">Нет правил</div>
                    )}

                    {sortings.map((s: any, si: number) => {
                        const isExpanded = expandedSortings.has(si);
                        return (
                            <div key={si} className="dc-constraint">
                                <div className="dc-dt-sort-header">
                                    <button
                                        type="button"
                                        className="dc-dt-sort-header__toggle"
                                        onClick={() => toggleSorting(si)}
                                    >
                                        <span className="dc-dt-sort-chevron">{isExpanded ? '▴' : '▾'}</span>
                                        <code className="dc-code">{s.id}</code>
                                        <span className="dc-muted">{(s.by ?? []).length} атр.</span>
                                    </button>
                                    <button
                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                        onClick={() => commit((d) => removeTableSorting(d, dataType.id, si))}
                                        disabled={isPublished}
                                    >×</button>
                                </div>
                                {isExpanded && (
                                    <div className="dc-constraint__body">
                                        <div className="dc-field">
                                            <label className="dc-field__label">ID правила</label>
                                            <input
                                                className="dc-input dc-input--compact dc-input--mono"
                                                value={s.id ?? ''}
                                                onChange={(e) =>
                                                    commit((d) => updateTableSortingField(d, dataType.id, si, 'id', e.target.value))
                                                }
                                            />
                                        </div>
                                        <div className="dc-field">
                                            <label className="dc-field__label">Атрибуты сортировки</label>
                                            {(s.by ?? []).map((b: any, bi: number) => (
                                                <div key={bi} className="dc-dt-sort-by-row">
                                                    <select
                                                        className="dc-input dc-input--compact"
                                                        value={b.attribute ?? ''}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableSortingByField(d, dataType.id, si, bi, 'attribute', e.target.value))
                                                        }
                                                    >
                                                        <option value="">— атрибут —</option>
                                                        {attributes.map((a: any) => (
                                                            <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        className="dc-input dc-input--compact"
                                                        style={{ width: 100 }}
                                                        value={b.direction ?? 'asc'}
                                                        onChange={(e) =>
                                                            commit((d) => updateTableSortingByField(d, dataType.id, si, bi, 'direction', e.target.value))
                                                        }
                                                    >
                                                        <option value="asc">↑ asc</option>
                                                        <option value="desc">↓ desc</option>
                                                    </select>
                                                    <button
                                                        className="dc-btn dc-btn--danger dc-btn--icon"
                                                        onClick={() => commit((d) => removeTableSortingBy(d, dataType.id, si, bi))}
                                                    >×</button>
                                                </div>
                                            ))}
                                            <button
                                                className="dc-btn dc-btn--dashed"
                                                onClick={() => commit((d) => addTableSortingBy(d, dataType.id, si))}
                                            >+ атрибут</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    <h4 className="dc-dt-section__title" style={{ marginTop: 20 }}>
                        Привязка столбцов
                    </h4>
                    <div className="dc-dt-toolbar">
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => commit((d) => addSortingByColumn(d, dataType.id))}
                        >+ Привязка</button>
                    </div>
                    {sortingByCols.map((c: any, ci: number) => (
                        <div key={ci} className="dc-dt-sort-by-row">
                            <select
                                className="dc-input dc-input--compact"
                                value={c.column ?? ''}
                                onChange={(e) =>
                                    commit((d) => updateSortingByColumn(d, dataType.id, ci, 'column', e.target.value))
                                }
                            >
                                <option value="">— столбец —</option>
                                {columns.map((col: any) => (
                                    <option key={col.id} value={col.id}>{col.id}</option>
                                ))}
                            </select>
                            <select
                                className="dc-input dc-input--compact"
                                value={c.sorting ?? ''}
                                onChange={(e) =>
                                    commit((d) => updateSortingByColumn(d, dataType.id, ci, 'sorting', e.target.value))
                                }
                            >
                                <option value="">— правило —</option>
                                {sortings.map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.id}</option>
                                ))}
                            </select>
                            <button
                                className="dc-btn dc-btn--danger dc-btn--icon"
                                onClick={() => commit((d) => removeSortingByColumn(d, dataType.id, ci))}
                            >×</button>
                        </div>
                    ))}

                    <div className="dc-field-row" style={{ marginTop: 12 }}>
                        <div className="dc-field">
                            <label className="dc-field__label">Сортировка по умолчанию</label>
                            <select
                                className="dc-input"
                                value={sortingByDefault?.column ?? ''}
                                onChange={(e) =>
                                    commit((d) => updateSortingByDefault(
                                        d, dataType.id, e.target.value || undefined, sortingByDefault?.direction,
                                    ))
                                }
                            >
                                <option value="">—</option>
                                {columns.map((col: any) => (
                                    <option key={col.id} value={col.id}>{col.id}</option>
                                ))}
                            </select>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Направление</label>
                            <select
                                className="dc-input"
                                value={sortingByDefault?.direction ?? 'asc'}
                                disabled={!sortingByDefault?.column}
                                onChange={(e) =>
                                    commit((d) => updateSortingByDefault(
                                        d, dataType.id, sortingByDefault?.column, e.target.value as any,
                                    ))
                                }
                            >
                                <option value="asc">↑ По возрастанию</option>
                                <option value="desc">↓ По убыванию</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'paging' && (
                <div className="dc-dt-section">
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Размеры страниц</label>
                            <input
                                className="dc-input"
                                value={(paging.sizes ?? []).join(', ')}
                                onChange={(e) => {
                                    const sizes = e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
                                    commit((d) => updatePaging(d, dataType.id, sizes, paging.defaultSize));
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
                                    commit((d) => updatePaging(d, dataType.id, paging.sizes, v));
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {tab === 'settings' && (
                <div className="dc-dt-section">
                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={dataType.name ?? ''}
                            onChange={(e) => commit((d) => updateDataTypeField(d, dataType.id, 'name', e.target.value))}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <textarea
                            className="dc-input dc-input--textarea"
                            value={dataType.description ?? ''}
                            onChange={(e) => commit((d) => updateDataTypeField(d, dataType.id, 'description', e.target.value))}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Максимум строк</label>
                        <input
                            className="dc-input"
                            type="number"
                            value={dataType.maxRows ?? ''}
                            onChange={(e) =>
                                commit((d) => updateDataTypeField(
                                    d, dataType.id, 'maxRows',
                                    e.target.value === '' ? undefined : Number(e.target.value),
                                ))
                            }
                        />
                    </div>
                    <PreviewPanel dataType={dataType} />
                </div>
            )}

            <ConfirmDialog
                open={pendingAttrDelete !== null}
                title="Удалить колонку?"
                onCancel={() => setPendingAttrDelete(null)}
                onConfirm={() => {
                    if (pendingAttrDelete === null) return;
                    commit((d) => removeTableAttribute(d, dataType.id, pendingAttrDelete));
                    setPendingAttrDelete(null);
                }}
            />
            <ConfirmDialog
                open={pendingColDelete !== null}
                title="Удалить столбец?"
                onCancel={() => setPendingColDelete(null)}
                onConfirm={() => {
                    if (pendingColDelete === null) return;
                    commit((d) => removeTableColumn(d, dataType.id, pendingColDelete));
                    setPendingColDelete(null);
                }}
            />
        </div>
    );
};