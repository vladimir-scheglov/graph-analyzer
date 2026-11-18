import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { DataTypeSchema } from '../../types';
import {
    addTableAttribute,
    removeTableAttribute,
    updateTableAttributeField,
    addTableColumn,
    removeTableColumn,
    updateTableColumnField,
    updateDataTypeField,
} from './dataType-handlers';

interface Props {
    dataType: DataTypeSchema;
}

const COLUMN_TYPES = [
    'String', 'Text', 'Integer', 'Decimal', 'Float', 'Bool',
    'Timestamp', 'Date', 'Time', 'TimestampRange',
    'MAC', 'IpAddress', 'CIDR', 'Uuid', 'URL',
];

export const TableForm: FC<Props> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const attributes = dataType.attributes ?? [];
    const view = dataType.view as { columns?: Array<{ id: string; attribute?: string; label?: string }> } | undefined;
    const columns = view?.columns ?? [];

    return (
        <div className="dc-table-form">
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={dataType.name ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateDataTypeField(doc, dataType.id, 'name', e.target.value))
                        }
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Максимум строк</label>
                    <input
                        className="dc-input"
                        type="number"
                        value={dataType.maxRows ?? ''}
                        onChange={(e) =>
                            commit((doc) =>
                                updateDataTypeField(doc, dataType.id, 'maxRows',
                                    e.target.value === '' ? undefined : Number(e.target.value)),
                            )
                        }
                    />
                </div>
            </div>

            {/* ============ Атрибуты таблицы ============ */}
            <div className="dc-enum-form__toolbar">
                <h4 className="dc-constraints__title">Колонки ({attributes.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addTableAttribute(doc, dataType.id))}
                >+ Колонка</button>
            </div>

            {attributes.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет колонок</div>
            )}

            <table className="dc-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Название</th>
                        <th>Тип</th>
                        <th style={{ width: 60 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {attributes.map((a, i) => (
                        <tr key={i}>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={a.id}
                                    onChange={(e) =>
                                        commit((doc) => updateTableAttributeField(doc, dataType.id, i, 'id', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={a.name ?? ''}
                                    onChange={(e) =>
                                        commit((doc) => updateTableAttributeField(doc, dataType.id, i, 'name', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <select
                                    className="dc-input dc-input--compact"
                                    value={a.dataType}
                                    onChange={(e) =>
                                        commit((doc) => updateTableAttributeField(doc, dataType.id, i, 'dataType', e.target.value))
                                    }
                                >
                                    {COLUMN_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => commit((doc) => removeTableAttribute(doc, dataType.id, i))}
                                >×</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ============ View columns ============ */}
            <div className="dc-enum-form__toolbar" style={{ marginTop: 20 }}>
                <h4 className="dc-constraints__title">Столбцы представления ({columns.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addTableColumn(doc, dataType.id))}
                >+ Столбец</button>
            </div>

            {columns.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет столбцов</div>
            )}

            <table className="dc-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Атрибут</th>
                        <th>Лейбл</th>
                        <th style={{ width: 60 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {columns.map((c, i) => (
                        <tr key={i}>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={c.id}
                                    onChange={(e) =>
                                        commit((doc) => updateTableColumnField(doc, dataType.id, i, 'id', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <select
                                    className="dc-input dc-input--compact"
                                    value={c.attribute ?? ''}
                                    onChange={(e) =>
                                        commit((doc) => updateTableColumnField(doc, dataType.id, i, 'attribute', e.target.value))
                                    }
                                >
                                    <option value="">—</option>
                                    {attributes.map((a) => (
                                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={c.label ?? ''}
                                    onChange={(e) =>
                                        commit((doc) => updateTableColumnField(doc, dataType.id, i, 'label', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => commit((doc) => removeTableColumn(doc, dataType.id, i))}
                                >×</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};