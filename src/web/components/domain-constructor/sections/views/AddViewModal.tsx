import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import {
    VIEW_TYPES, ViewType, addView, validateViewId,
} from './views-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddViewModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [type, setType] = useState<ViewType>('list');
    const [entity, setEntity] = useState<string | null>(null);
    const [label, setLabel] = useState('');

    useEffect(() => {
        if (open) { setId(''); setType('list'); setEntity(null); setLabel(''); }
    }, [open]);

    const idErr = id ? validateViewId(id) : null;
    const dup = schema.views.some((v) => v.id === id);
    const needsEntity = VIEW_TYPES.find((t) => t.value === type)?.needsEntity ?? false;
    const canSubmit = !!id && !idErr && !dup && (!needsEntity || !!entity);

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новое представление</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Тип <span className="dc-field__required">*</span></label>
                        <select
                            className="dc-input"
                            value={type}
                            onChange={(e) => setType(e.target.value as ViewType)}
                        >
                            {VIEW_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="lists.iocs, allattributesView, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Лейбл</label>
                        <input
                            className="dc-input"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>
                    {needsEntity && (
                        <div className="dc-field">
                            <label className="dc-field__label">Сущность <span className="dc-field__required">*</span></label>
                            <EntitySelect value={entity} onChange={setEntity} />
                        </div>
                    )}
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addView(doc, {
                                    id, type,
                                    entity: entity ?? undefined,
                                    label: label || undefined,
                                }),
                            );
                            select(`view:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};