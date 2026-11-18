import { useEffect, useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    WIDGET_TYPES, WidgetType,
    addWidget, validateWidgetId,
} from './widgets-handlers';

interface Props {
    open: boolean;
    viewId: string;
    onClose: () => void;
}

export const AddWidgetModal: FC<Props> = ({ open, viewId, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [type, setType] = useState<WidgetType>('attribute');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) { setId(''); setType('attribute'); setDescription(''); }
    }, [open]);

    const view = schema.views.find((v) => v.id === viewId);
    const widgets = ((view as any)?.widgets ?? []) as any[];
    const idErr = id ? validateWidgetId(id) : null;
    const dup = widgets.some((w) => w.id === id);
    const canSubmit = !!id && !idErr && !dup;

    // Группировка для optgroup
    const groups = useMemo(() => {
        const map = new Map<string, typeof WIDGET_TYPES>();
        for (const t of WIDGET_TYPES) {
            if (!map.has(t.group)) map.set(t.group, []);
            map.get(t.group)!.push(t);
        }
        return [...map.entries()];
    }, []);

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый виджет</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as WidgetType)}
                        >
                            {groups.map(([g, types]) => (
                                <optgroup key={g} label={g}>
                                    {types.map((t) => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="editors_deviceName, buttons_create, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <input
                            className="dc-input"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addWidget(doc, viewId, { id, type, description: description || undefined }),
                            );
                            select(`view:${viewId}/widget:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};