import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { DataTypeSchema } from '../../types';
import {
    addEnumValue,
    removeEnumValue,
    updateEnumValueField,
    moveEnumValue,
    setEnumColor,
    updateDataTypeField,
} from './dataType-handlers';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { useState } from 'react';

interface Props {
    dataType: DataTypeSchema;
}

export const EnumForm: FC<Props> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);

    const values = dataType.values ?? [];
    const view = (dataType as any).view as Array<{ value: string; color?: string }> | undefined;
    const colorByValue = new Map(
        (view ?? []).map((v) => [v.value, v.color]),
    );

    return (
        <div className="dc-enum-form">
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
                    <label className="dc-field__label">Описание</label>
                    <input
                        className="dc-input"
                        value={dataType.description ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateDataTypeField(doc, dataType.id, 'description', e.target.value))
                        }
                    />
                </div>
            </div>

            <div className="dc-enum-form__toolbar">
                <h4 className="dc-constraints__title">Значения ({values.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addEnumValue(doc, dataType.id))}
                    disabled={isPublished}
                    title={isPublished ? 'Заблокировано после публикации' : undefined}
                >+ Значение</button>
            </div>

            {values.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет значений</div>
            )}

            <table className="dc-table">
                <thead>
                    <tr>
                        <th style={{ width: 60 }}>Цвет</th>
                        <th>ID</th>
                        <th>Название</th>
                        <th style={{ width: 80 }}>Скрытый</th>
                        <th style={{ width: 120 }}></th>
                    </tr>
                </thead>
                <tbody>
                    {values.map((v, i) => (
                        <tr key={i}>
                            <td>
                                <input
                                    type="color"
                                    className="dc-color-input"
                                    value={toHex(colorByValue.get(v.id) ?? '#64748b')}
                                    onChange={(e) =>
                                        commit((doc) => setEnumColor(doc, dataType.id, v.id, e.target.value))
                                    }
                                    disabled={isPublished}
                                />
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={v.id}
                                    onChange={(e) =>
                                        commit((doc) => {
                                            // меняем id + цвет по valueId
                                            const oldId = v.id;
                                            updateEnumValueField(doc, dataType.id, i, 'id', e.target.value);
                                            if (colorByValue.has(oldId) && colorByValue.get(oldId)) {
                                                const view = doc.get(['dataTypes',
                                                    findDataTypeIdx(doc, dataType.id), 'view']) as any[];
                                                if (Array.isArray(view)) {
                                                    const vi = view.findIndex((x) => x && x.value === oldId);
                                                    if (vi >= 0) {
                                                        doc.set(['dataTypes', findDataTypeIdx(doc, dataType.id), 'view', vi, 'value'], e.target.value);
                                                    }
                                                }
                                            }
                                        })
                                    }
                                    disabled={isPublished}
                                />
                            </td>
                            <td>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={v.name ?? ''}
                                    onChange={(e) =>
                                        commit((doc) => updateEnumValueField(doc, dataType.id, i, 'name', e.target.value))
                                    }
                                />
                            </td>
                            <td>
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={!!v.hidden}
                                    onChange={(e) =>
                                        commit((doc) => updateEnumValueField(doc, dataType.id, i, 'hidden', e.target.checked))
                                    }
                                />
                            </td>
                            <td>
                                <button
                                    className="dc-btn dc-btn--icon"
                                    onClick={() => commit((doc) => moveEnumValue(doc, dataType.id, i, i - 1))}
                                    disabled={i === 0 || isPublished}
                                    title="Выше"
                                >↑</button>
                                <button
                                    className="dc-btn dc-btn--icon"
                                    onClick={() => commit((doc) => moveEnumValue(doc, dataType.id, i, i + 1))}
                                    disabled={i === values.length - 1 || isPublished}
                                    title="Ниже"
                                >↓</button>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => setPendingDelete(i)}
                                    disabled={isPublished}
                                    title="Удалить"
                                >×</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <ConfirmDialog
                open={pendingDelete !== null}
                title="Удалить значение перечисления?"
                description={
                    <p>
                        Значение будет удалено. Если оно используется в объектах — данные
                        станут невалидными на бэкенде.
                        {isPublished && <><br /><strong>После публикации удаление запрещено.</strong></>}
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (pendingDelete === null) return;
                    commit((doc) => removeEnumValue(doc, dataType.id, pendingDelete));
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};

// helpers
function findDataTypeIdx(doc: any, id: string): number {
    const arr = doc.get(['dataTypes']);
    return Array.isArray(arr) ? arr.findIndex((d: any) => d && d.id === id) : -1;
}

function toHex(color: string): string {
    if (color.startsWith('#')) return color.length === 4 ? expandShortHex(color) : color.slice(0, 7);
    // named — fallback
    return '#64748b';
}
function expandShortHex(c: string): string {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
}