import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateWidgetField, updateWidgetNestedField } from '../widgets-handlers';
import { LinkageSelect } from '../../../ui/LinkageSelect';

interface Props {
    viewId: string;
    widget: any;
}

export const LinkageWidgetForm: FC<Props> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, field, value));

    const setControl = (field: string, value: unknown) =>
        commit((doc) => updateWidgetNestedField(doc, viewId, widget.id, ['control', field], value));

    const control = widget.control ?? {};
    const side = widget.side ?? 2;
    const controlType = control.type ?? (side === 1 ? 'select' : 'multi_select');

    // Доступные типы контролов по стороне
    const availableControls = side === 1
        ? ['select']
        : ['multi_select', 'table'];

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 12 }}>Связь</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    Linkage <span className="dc-field__required">*</span>
                </label>
                <LinkageSelect
                    value={widget.linkage ?? null}
                    onChange={(v) => set('linkage', v ?? undefined)}
                />
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Сторона</label>
                    <select
                        className="dc-input"
                        value={side}
                        onChange={(e) => {
                            const s = Number(e.target.value) as 1 | 2;
                            set('side', s);
                            // Если текущий control несовместим со стороной — сбросить
                            const allowed = s === 1 ? ['select'] : ['multi_select', 'table'];
                            if (controlType && !allowed.includes(controlType)) {
                                setControl('type', undefined);
                            }
                        }}
                    >
                        <option value={1}>1 (один объект)</option>
                        <option value={2}>2 (несколько объектов)</option>
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Контрол</label>
                    <select
                        className="dc-input"
                        value={controlType}
                        onChange={(e) => setControl('type', e.target.value)}
                    >
                        {availableControls.map((c) => (
                            <option key={c} value={c}>
                                {c === 'select' && '— select (выбор одного)'}
                                {c === 'multi_select' && '— multi_select (теги)'}
                                {c === 'table' && '— table (расширенная таблица)'}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Лейбл</label>
                <input
                    className="dc-input"
                    value={widget.label ?? ''}
                    onChange={(e) => set('label', e.target.value || undefined)}
                />
            </div>

            {controlType === 'table' && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Списочное представление (addLinksView)</label>
                        <input
                            className="dc-input"
                            value={control.addLinksView ?? ''}
                            onChange={(e) => setControl('addLinksView', e.target.value || undefined)}
                            placeholder="lists.iocs"
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">displayMode</label>
                        <select
                            className="dc-input"
                            value={control.displayMode ?? ''}
                            onChange={(e) => setControl('displayMode', e.target.value || undefined)}
                        >
                            <option value="">— по умолчанию —</option>
                            <option value="flat">flat</option>
                            <option value="grouped">grouped</option>
                        </select>
                    </div>

                    <TableColumnsEditor viewId={viewId} widget={widget} />
                </>
            )}
        </div>
    );
};

// ============ columns ============

const TableColumnsEditor: FC<{ viewId: string; widget: any }> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const columns = widget.control?.columns ?? [];
    const widgetLinkage = widget.linkage;
    const linkage = schema.linkages.find((l) => l.id === widgetLinkage);
    const linkageAttrs = linkage?.attributes ?? [];

    const add = () =>
        commit((doc) => updateWidgetNestedField(
            doc, viewId, widget.id,
            ['control', 'columns', columns.length],
            { id: `col${columns.length + 1}`, attribute: '' },
        ));

    const remove = (i: number) =>
        commit((doc) => {
            const wIdx = findWIdx(doc, viewId, widget.id);
            if (wIdx < 0) return;
            const vIdx = findViewIdx(doc, viewId);
            if (vIdx < 0) return;
            doc.doc.deleteIn(['views', vIdx, 'widgets', wIdx, 'control', 'columns', i] as any);
        });

    const setColField = (i: number, field: string, value: unknown) =>
        commit((doc) => updateWidgetNestedField(
            doc, viewId, widget.id,
            ['control', 'columns', i, field],
            value,
        ));

    return (
        <div className="dc-constraints">
            <div className="dc-constraints__header">
                <label className="dc-field__label">Столбцы ({columns.length})</label>
                <button className="dc-btn dc-btn--dashed" onClick={add}>+ столбец</button>
            </div>
            {columns.map((c: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={() => remove(i)}>×</button>
                    </div>
                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">ID</label>
                            <input
                                className="dc-input dc-input--compact"
                                value={c.id ?? ''}
                                onChange={(e) => setColField(i, 'id', e.target.value)}
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Атрибут связи</label>
                            <select
                                className="dc-input dc-input--compact"
                                value={c.attribute ?? ''}
                                onChange={(e) => setColField(i, 'attribute', e.target.value)}
                            >
                                <option value="">—</option>
                                {linkageAttrs.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

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