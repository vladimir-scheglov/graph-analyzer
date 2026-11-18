import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateWidgetField } from '../widgets-handlers';
import { getAvailableControls } from '../../../model/compat-tables';

interface Props {
    viewId: string;
    widget: any;
}

export const AttributeWidgetForm: FC<Props> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    // Сущность из view
    const view = schema.views.find((v) => v.id === viewId);
    const entityFqid = view?.entity
        ? `${schema.metadata.id.toLowerCase()}/${view.entity.toLowerCase()}`.toLowerCase()
        : null;
    const entity = entityFqid
        ? (modelIndex.entitiesByFqid[entityFqid] as any)
        : null;

    const attr = entity?.attributes?.find((a: any) => a.id === widget.attribute);
    const dataType = attr?.dataType ?? 'String';
    const availableControls = getAvailableControls(dataType);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, field, value));

    const control = widget.control ?? {};
    const setControl = (field: string, value: unknown) =>
        commit((doc) => {
            const wIdx = findWIdx(doc, viewId, widget.id);
            if (wIdx < 0) return;
            const vIdx = findViewIdx(doc, viewId);
            if (vIdx < 0) return;
            if (value === undefined || value === null || value === '') {
                doc.doc.deleteIn(['views', vIdx, 'widgets', wIdx, 'control', field] as any);
            } else {
                doc.set(['views', vIdx, 'widgets', wIdx, 'control', field], value);
            }
        });

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 12 }}>Атрибут</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    Атрибут <span className="dc-field__required">*</span>
                </label>
                <select
                    className="dc-input"
                    value={widget.attribute ?? ''}
                    onChange={(e) => set('attribute', e.target.value)}
                >
                    <option value="">— выберите —</option>
                    {entity?.attributes?.map((a: any) => (
                        <option key={a.id} value={a.id}>
                            {a.name || a.id} ({a.dataType})
                        </option>
                    ))}
                </select>
                {!entity && (
                    <div className="dc-field__hint">
                        Сущность не определена в view. Сначала укажите сущность во вкладке «Основное».
                    </div>
                )}
            </div>

            {attr && (
                <>
                    <h4 className="dc-constraints__title" style={{ marginTop: 12 }}>Элемент управления</h4>
                    <div className="dc-field">
                        <label className="dc-field__label">
                            Тип (для {dataType}; по умолчанию — {availableControls[0] ?? 'text'})
                        </label>
                        <select
                            className="dc-input"
                            value={control.type ?? ''}
                            onChange={(e) => setControl('type', e.target.value || undefined)}
                        >
                            <option value="">— автоматически —</option>
                            {availableControls.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {control.type === 'bool_text' && (
                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">trueText</label>
                                <input
                                    className="dc-input"
                                    value={control.trueText ?? ''}
                                    onChange={(e) => setControl('trueText', e.target.value)}
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">falseText</label>
                                <input
                                    className="dc-input"
                                    value={control.falseText ?? ''}
                                    onChange={(e) => setControl('falseText', e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {(control.type === 'slider' || control.type?.includes('_slider')) && (
                        <div className="dc-field">
                            <label className="dc-field__label">Шаг</label>
                            <input
                                className="dc-input"
                                type="number"
                                value={control.step ?? ''}
                                onChange={(e) =>
                                    setControl('step', e.target.value === '' ? undefined : Number(e.target.value))
                                }
                            />
                        </div>
                    )}

                    {control.type === 'dragdroparea' && (
                        <div className="dc-field">
                            <label className="dc-field__label">Текст области</label>
                            <input
                                className="dc-input"
                                value={control.text ?? ''}
                                onChange={(e) => setControl('text', e.target.value)}
                            />
                        </div>
                    )}

                    {dataType === 'Array' && (
                        <div className="dc-field">
                            <label className="dc-field__label">Высота ячейки (строк)</label>
                            <input
                                className="dc-input"
                                type="number"
                                value={widget.rowHeight ?? ''}
                                onChange={(e) =>
                                    set('rowHeight', e.target.value === '' ? undefined : Number(e.target.value))
                                }
                            />
                        </div>
                    )}

                    {dataType === 'Counter' && (
                        <div className="dc-field">
                            <label className="dc-field__label">Цветовая схема</label>
                            <select
                                className="dc-input"
                                value={widget.counterColorPattern ?? ''}
                                onChange={(e) => set('counterColorPattern', e.target.value || undefined)}
                            >
                                <option value="">— по умолчанию —</option>
                                {schema.counterColorPatterns.map((p) => (
                                    <option key={p.id} value={p.id}>{p.id}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// helpers
function findViewIdx(doc: any, viewId: string): number {
    const arr = doc.get(['views']);
    return Array.isArray(arr) ? arr.findIndex((v: any) => v && v.id === viewId) : -1;
}
function findWIdx(doc: any, viewId: string, widgetId: string): number {
    const vIdx = findViewIdx(doc, viewId);
    if (vIdx < 0) return -1;
    const ws = doc.get(['views', vIdx, 'widgets']);
    return Array.isArray(ws) ? ws.findIndex((w: any) => w && w.id === widgetId) : -1;
}