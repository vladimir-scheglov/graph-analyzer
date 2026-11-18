import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    updateTableColumnField, updateTableColumnWidth, moveTableColumn,
} from './views-handlers';

interface Props {
    viewId: string;
    column: any;
    index: number;
    onRemove: () => void;
}

export const TableColumnRow: FC<Props> = ({ viewId, column, index, onRemove }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    // Список доступных атрибутов из ModelIndex для сущности
    const view = schema.views.find((v) => v.id === viewId);
    const entityFqid = view?.entity
        ? `${schema.metadata.id.toLowerCase()}/${view.entity.toLowerCase()}`.toLowerCase()
        : null;
    const entity = entityFqid
        ? (modelIndex.entitiesByFqid[entityFqid] as any)
        : null;

    const set = (field: string, value: unknown) =>
        commit((doc) => updateTableColumnField(doc, viewId, index, field, value));

    const setWidth = (which: 'default' | 'min' | 'max', value: number | undefined) =>
        commit((doc) => updateTableColumnWidth(doc, viewId, index, which, value));

    const layout = column.layout ?? {};
    const visible = layout.visible !== false;
    const width = layout.width ?? {};

    return (
        <div className="dc-table-column-row">
            <div className="dc-table-column-row__header">
                <span className="dc-badge">#{index + 1}</span>
                <div className="dc-table-column-row__reorder">
                    <button
                        className="dc-btn dc-btn--icon"
                        onClick={() => commit((doc) => moveTableColumn(doc, viewId, index, index - 1))}
                        disabled={index === 0}
                        title="Выше"
                    >↑</button>
                    <button
                        className="dc-btn dc-btn--icon"
                        onClick={() => commit((doc) => moveTableColumn(doc, viewId, index, index + 1))}
                        title="Ниже"
                    >↓</button>
                </div>
                <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={onRemove} title="Удалить">×</button>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={column.id ?? ''}
                        onChange={(e) => set('id', e.target.value)}
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Атрибут</label>
                    <select
                        className="dc-input dc-input--compact"
                        value={column.attribute ?? ''}
                        onChange={(e) => set('attribute', e.target.value)}
                    >
                        <option value="">—</option>
                        {entity?.attributes?.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.name || a.id}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Лейбл</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={column.label ?? ''}
                        onChange={(e) => set('label', e.target.value)}
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">
                        <input
                            type="checkbox"
                            className="dc-checkbox"
                            checked={visible}
                            onChange={(e) =>
                                commit((doc) =>
                                    updateTableColumnField(doc, viewId, index, 'layout',
                                        { ...layout, visible: e.target.checked }),
                                )
                            }
                        />{' '}
                        Видимый
                    </label>
                </div>
            </div>

            <div className="dc-field-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div className="dc-field">
                    <label className="dc-field__label">width.default</label>
                    <input
                        className="dc-input dc-input--compact"
                        type="number"
                        value={width.default ?? ''}
                        onChange={(e) =>
                            setWidth('default', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">width.min</label>
                    <input
                        className="dc-input dc-input--compact"
                        type="number"
                        value={width.min ?? ''}
                        onChange={(e) =>
                            setWidth('min', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">width.max</label>
                    <input
                        className="dc-input dc-input--compact"
                        type="number"
                        value={width.max ?? ''}
                        onChange={(e) =>
                            setWidth('max', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                    />
                </div>
            </div>
        </div>
    );
};