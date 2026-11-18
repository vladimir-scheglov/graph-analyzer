import { useState, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateWidgetField } from '../widgets-handlers';
import { ActionSelect } from '../../../ui/ActionSelect';

interface Props {
    viewId: string;
    widget: any;
}

export const ActionWidgetForm: FC<Props> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);

    const hasActionsArray = Array.isArray(widget.actions);
    const [mode, setMode] = useState<'one' | 'many'>(
        hasActionsArray ? 'many' : 'one',
    );

    const set = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, field, value));

    const control = widget.control ?? {};

    const setControl = (field: string, value: unknown) =>
        commit((doc) => updateWidgetField(doc, viewId, widget.id, `control.${field}`, value));

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 12 }}>Действие</h4>

            <div className="dc-field">
                <label className="dc-field__label">Количество действий</label>
                <select
                    className="dc-input"
                    value={mode}
                    onChange={(e) => {
                        const m = e.target.value as 'one' | 'many';
                        setMode(m);
                        if (m === 'one') {
                            commit((doc) => {
                                // Удалить actions, установить action = ''
                                const path = findPath(doc, viewId, widget.id);
                                if (!path) return;
                                doc.doc.deleteIn([...path, 'actions'] as any);
                                doc.set([...path, 'action'], '');
                            });
                        } else {
                            commit((doc) => {
                                const path = findPath(doc, viewId, widget.id);
                                if (!path) return;
                                doc.doc.deleteIn([...path, 'action'] as any);
                                doc.set([...path, 'actions'], []);
                            });
                        }
                    }}
                >
                    <option value="one">Одно</option>
                    <option value="many">Несколько (выпадающее меню)</option>
                </select>
            </div>

            {mode === 'one' && (
                <div className="dc-field">
                    <label className="dc-field__label">
                        Действие <span className="dc-field__required">*</span>
                    </label>
                    <ActionSelect
                        value={widget.action ?? null}
                        onChange={(v) => set('action', v ?? undefined)}
                    />
                </div>
            )}

            {mode === 'many' && (
                <ActionsListEditor viewId={viewId} widget={widget} />
            )}

            <h4 className="dc-constraints__title" style={{ marginTop: 12 }}>Оформление</h4>

            <div className="dc-field">
                <label className="dc-field__label">Тип контрола</label>
                <select
                    className="dc-input"
                    value={control.type ?? 'regular_button'}
                    onChange={(e) => setControl('type', e.target.value)}
                >
                    <option value="regular_button">Кнопка</option>
                    <option value="dropdown">Выпадающий список (bulk edit_attribute)</option>
                    <option value="dragdroparea">Область перетаскивания</option>
                </select>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Иконка (View ID Ref)</label>
                <input
                    className="dc-input"
                    value={control.icon ?? ''}
                    onChange={(e) => setControl('icon', e.target.value || undefined)}
                    placeholder="icons@Trash"
                />
            </div>
        </div>
    );
};

// ============ Массив actions ============

const ActionsListEditor: FC<{ viewId: string; widget: any }> = ({ viewId, widget }) => {
    const commit = useEditorStore((s) => s.commit);
    const actions = widget.actions ?? [];

    const add = () =>
        commit((doc) => {
            const path = findPath(doc, viewId, widget.id);
            if (!path) return;
            doc.set([...path, 'actions', actions.length], { action: '' });
        });

    const remove = (i: number) =>
        commit((doc) => {
            const path = findPath(doc, viewId, widget.id);
            if (!path) return;
            doc.doc.deleteIn([...path, 'actions', i] as any);
        });

    const setField = (i: number, field: string, value: string) =>
        commit((doc) => {
            const path = findPath(doc, viewId, widget.id);
            if (!path) return;
            doc.set([...path, 'actions', i, field], value);
        });

    return (
        <div className="dc-constraints">
            <div className="dc-constraints__header">
                <label className="dc-field__label">Действия ({actions.length})</label>
                <button className="dc-btn dc-btn--dashed" onClick={add}>+ действие</button>
            </div>
            {actions.map((a: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button className="dc-btn dc-btn--danger dc-btn--icon" onClick={() => remove(i)}>×</button>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Action</label>
                        <ActionSelect
                            value={a.action ?? null}
                            onChange={(v) => setField(i, 'action', v ?? '')}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

function findPath(doc: any, viewId: string, widgetId: string): readonly (string | number)[] | null {
    const views = doc.get(['views']);
    if (!Array.isArray(views)) return null;
    const vIdx = views.findIndex((v: any) => v && v.id === viewId);
    if (vIdx < 0) return null;
    const widgets = doc.get(['views', vIdx, 'widgets']);
    if (!Array.isArray(widgets)) return null;
    const wIdx = widgets.findIndex((w: any) => w && w.id === widgetId);
    if (wIdx < 0) return null;
    return ['views', vIdx, 'widgets', wIdx];
}